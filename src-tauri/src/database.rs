use crate::models::*;
use rusqlite::types::Value;
use rusqlite::{params, params_from_iter, Connection, Result};
use std::path::PathBuf;
use std::sync::Mutex;

// FIX: store a single persistent Connection behind a Mutex instead of opening
// a new connection for every query. The old approach re-ran PRAGMA journal_mode=WAL
// and opened/closed an OS file handle on every Tauri command invocation.
// rusqlite::Connection is Send but not Sync; Mutex<Connection> makes it Sync.
pub struct Database {
    pub path: PathBuf,
    inner: Mutex<Connection>,
}

impl Database {
    pub fn new(app_dir: &PathBuf) -> Result<Self> {
        let path = app_dir.join("whatwasthat.db");
        let conn = Connection::open(&path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        let db = Self { path, inner: Mutex::new(conn) };
        db.migrate()?;
        Ok(db)
    }

    // Returns a MutexGuard that derefs to &Connection.  If the mutex is poisoned
    // (only happens after a panic inside a lock scope) we recover the inner value
    // rather than propagating the poison — a single query panic should not kill
    // all future DB access.
    fn conn(&self) -> std::sync::MutexGuard<Connection> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn migrate(&self) -> Result<()> {
        let conn = self.conn();
        conn.execute_batch("
            CREATE TABLE IF NOT EXISTS screenshots (
                id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, image_path TEXT NOT NULL,
                image_thumb TEXT, ocr_text TEXT, ocr_masked TEXT,
                has_sensitive INTEGER NOT NULL DEFAULT 0, title TEXT, description TEXT,
                category TEXT, tags TEXT DEFAULT '[]', source_hint TEXT, app_info TEXT,
                confidence REAL, detected_language TEXT, phash TEXT,
                is_favorite INTEGER NOT NULL DEFAULT 0, is_archived INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'pending', error_msg TEXT,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
            );
            CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS user_corrections (
                id INTEGER PRIMARY KEY AUTOINCREMENT, screenshot_id TEXT NOT NULL,
                old_category TEXT, new_category TEXT NOT NULL,
                old_tags TEXT DEFAULT '[]', new_tags TEXT DEFAULT '[]',
                corrected_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
                FOREIGN KEY (screenshot_id) REFERENCES screenshots(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS screenshot_tags (
                screenshot_id TEXT NOT NULL, tag TEXT NOT NULL,
                PRIMARY KEY (screenshot_id, tag),
                FOREIGN KEY (screenshot_id) REFERENCES screenshots(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS processing_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT, screenshot_id TEXT,
                stage TEXT NOT NULL, level TEXT NOT NULL, message TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
            );
        ")?;

        for (col, def) in &[
            ("app_info","TEXT"),("confidence","REAL"),("detected_language","TEXT"),
            ("is_favorite","INTEGER NOT NULL DEFAULT 0"),
            ("is_archived","INTEGER NOT NULL DEFAULT 0"),
            ("phash","TEXT"),("ocr_masked","TEXT"),
            ("has_sensitive","INTEGER NOT NULL DEFAULT 0"),
        ] {
            let _ = conn.execute_batch(&format!("ALTER TABLE screenshots ADD COLUMN {} {};", col, def));
        }

        conn.execute_batch("
            CREATE VIRTUAL TABLE IF NOT EXISTS screenshots_fts USING fts5(
                id UNINDEXED, title, description, ocr_text, tags, category,
                content=screenshots, content_rowid=rowid
            );
            CREATE TRIGGER IF NOT EXISTS screenshots_ai AFTER INSERT ON screenshots BEGIN
                INSERT INTO screenshots_fts(rowid,id,title,description,ocr_text,tags,category)
                VALUES (new.rowid,new.id,new.title,new.description,new.ocr_text,new.tags,new.category);
            END;
            CREATE TRIGGER IF NOT EXISTS screenshots_ad AFTER DELETE ON screenshots BEGIN
                INSERT INTO screenshots_fts(screenshots_fts,rowid,id,title,description,ocr_text,tags,category)
                VALUES ('delete',old.rowid,old.id,old.title,old.description,old.ocr_text,old.tags,old.category);
            END;
            CREATE TRIGGER IF NOT EXISTS screenshots_au AFTER UPDATE ON screenshots BEGIN
                INSERT INTO screenshots_fts(screenshots_fts,rowid,id,title,description,ocr_text,tags,category)
                VALUES ('delete',old.rowid,old.id,old.title,old.description,old.ocr_text,old.tags,old.category);
                INSERT INTO screenshots_fts(rowid,id,title,description,ocr_text,tags,category)
                VALUES (new.rowid,new.id,new.title,new.description,new.ocr_text,new.tags,new.category);
            END;
            CREATE TRIGGER IF NOT EXISTS screenshots_tags_ai AFTER INSERT ON screenshots BEGIN
                INSERT OR IGNORE INTO screenshot_tags(screenshot_id,tag)
                SELECT new.id, LOWER(TRIM(value)) FROM json_each(new.tags) WHERE TRIM(value)<>'';
            END;
            CREATE TRIGGER IF NOT EXISTS screenshots_tags_au AFTER UPDATE OF tags ON screenshots BEGIN
                DELETE FROM screenshot_tags WHERE screenshot_id=old.id;
                INSERT OR IGNORE INTO screenshot_tags(screenshot_id,tag)
                SELECT new.id, LOWER(TRIM(value)) FROM json_each(new.tags) WHERE TRIM(value)<>'';
            END;
            CREATE TRIGGER IF NOT EXISTS screenshots_tags_ad AFTER DELETE ON screenshots BEGIN
                DELETE FROM screenshot_tags WHERE screenshot_id=old.id;
            END;
        ")?;

        let _ = conn.execute_batch("
            CREATE INDEX IF NOT EXISTS idx_phash ON screenshots(phash) WHERE phash IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_screenshot_tags_tag ON screenshot_tags(tag);
            CREATE INDEX IF NOT EXISTS idx_screenshot_tags_screenshot_id ON screenshot_tags(screenshot_id);
        ");

        let _ = conn.execute_batch("
            INSERT OR IGNORE INTO screenshot_tags(screenshot_id,tag)
            SELECT id, LOWER(TRIM(value)) FROM screenshots, json_each(screenshots.tags)
            WHERE TRIM(value)<>'';
        ");

        Ok(())
    }

    pub fn insert_screenshot(&self, s: &Screenshot) -> Result<()> {
        let conn = self.conn();
        let tags = serde_json::to_string(&s.tags).unwrap_or_default();
        conn.execute(
            "INSERT INTO screenshots (id,timestamp,image_path,image_thumb,ocr_text,ocr_masked,
             has_sensitive,title,description,category,tags,source_hint,app_info,confidence,
             detected_language,phash,is_favorite,is_archived,status,error_msg,created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21)",
            params![s.id,s.timestamp,s.image_path,s.image_thumb,s.ocr_text,s.ocr_masked,
                    s.has_sensitive as i64,s.title,s.description,s.category,tags,
                    s.source_hint,s.app_info,s.confidence,s.detected_language,s.phash,
                    s.is_favorite as i64,s.is_archived as i64,s.status,s.error_msg,s.created_at],
        )?;
        Ok(())
    }

    pub fn update_screenshot(&self, s: &Screenshot) -> Result<()> {
        let conn = self.conn();
        let tags = serde_json::to_string(&s.tags).unwrap_or_default();
        conn.execute(
            "UPDATE screenshots SET ocr_text=?1,ocr_masked=?2,has_sensitive=?3,title=?4,
             description=?5,category=?6,tags=?7,source_hint=?8,app_info=?9,confidence=?10,
             detected_language=?11,phash=?12,is_favorite=?13,is_archived=?14,status=?15,
             error_msg=?16,image_thumb=?17 WHERE id=?18",
            params![s.ocr_text,s.ocr_masked,s.has_sensitive as i64,s.title,s.description,
                    s.category,tags,s.source_hint,s.app_info,s.confidence,s.detected_language,
                    s.phash,s.is_favorite as i64,s.is_archived as i64,s.status,s.error_msg,
                    s.image_thumb,s.id],
        )?;
        Ok(())
    }

    pub fn get_screenshot(&self, id: &str) -> Result<Option<Screenshot>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(SEL_ALL_COLS)?;
        let result: Vec<Screenshot> = stmt.query_map(params![id], row_to_ss)?.collect::<Result<Vec<_>>>()?;
        Ok(result.into_iter().next())
    }

    pub fn search_screenshots(&self, q: &SearchQuery) -> Result<Vec<Screenshot>> {
        let conn = self.conn();
        let mut params_v: Vec<Value> = Vec::new();
        let mut where_parts: Vec<String> = Vec::new();
        let text_query = q.query.as_ref().map(|x| x.trim()).filter(|x| !x.is_empty());
        let with_fts = text_query.is_some();
        let p = if with_fts { "s." } else { "" };

        if with_fts {
            where_parts.push("screenshots_fts MATCH ?".into());
            params_v.push(Value::Text(format!("{}*", text_query.unwrap())));
        }
        if let Some(ref category) = q.category {
            if !category.trim().is_empty() {
                where_parts.push(format!("{p}category = ?"));
                params_v.push(Value::Text(category.trim().to_string()));
            }
        }
        if let Some(ref from) = q.date_from {
            if !from.trim().is_empty() {
                where_parts.push(format!("{p}created_at >= (? || 'T00:00:00Z')"));
                params_v.push(Value::Text(from.trim().to_string()));
            }
        }
        if let Some(ref to) = q.date_to {
            if !to.trim().is_empty() {
                where_parts.push(format!("{p}created_at <= (? || 'T23:59:59Z')"));
                params_v.push(Value::Text(to.trim().to_string()));
            }
        }
        if q.only_low_confidence {
            where_parts.push(format!("{p}confidence IS NOT NULL AND {p}confidence < ?"));
            params_v.push(Value::Real(0.6));
        }
        if q.only_favorites {
            where_parts.push(format!("{p}is_favorite = 1"));
        }
        if q.only_error {
            where_parts.push(format!("{p}status = 'error'"));
        }

        if q.only_archived {
            where_parts.push(format!("{p}is_archived = 1"));
        } else if !q.include_archived {
            where_parts.push(format!("{p}is_archived = 0"));
        }

        let mut unique_tags: Vec<String> = Vec::new();
        for raw in &q.tags {
            let tag = raw.trim().to_lowercase();
            if !tag.is_empty() && !unique_tags.iter().any(|x| x == &tag) {
                unique_tags.push(tag);
            }
        }
        for tag in unique_tags {
            where_parts.push(format!(
                "EXISTS (SELECT 1 FROM screenshot_tags st WHERE st.screenshot_id = {p}id AND st.tag = ?)"
            ));
            params_v.push(Value::Text(tag));
        }

        let where_sql = if where_parts.is_empty() { "1=1".to_string() } else { where_parts.join(" AND ") };

        let sql = if with_fts {
            format!(
                "SELECT s.id,s.timestamp,s.image_path,s.image_thumb,s.ocr_text,s.ocr_masked,
                 s.has_sensitive,s.title,s.description,s.category,s.tags,s.source_hint,s.app_info,
                 s.confidence,s.detected_language,s.phash,s.is_favorite,s.is_archived,s.status,
                 s.error_msg,s.created_at FROM screenshots s JOIN screenshots_fts f ON s.id=f.id
                 WHERE {} ORDER BY rank LIMIT ? OFFSET ?",
                where_sql
            )
        } else {
            format!(
                "SELECT id,timestamp,image_path,image_thumb,ocr_text,ocr_masked,has_sensitive,
                 title,description,category,tags,source_hint,app_info,confidence,detected_language,
                 phash,is_favorite,is_archived,status,error_msg,created_at FROM screenshots
                 WHERE {} ORDER BY created_at DESC LIMIT ? OFFSET ?",
                where_sql
            )
        };

        params_v.push(Value::Integer(q.limit));
        params_v.push(Value::Integer(q.offset));

        let mut stmt = conn.prepare(&sql)?;
        let result: Vec<Screenshot> = stmt
            .query_map(params_from_iter(params_v.iter()), row_to_ss)?
            .collect::<Result<Vec<_>>>()?;
        Ok(result)
    }

    pub fn find_similar_phash(&self, phash_hex: &str, threshold_bits: u32) -> Result<Vec<(String, String, u32)>> {
        let conn = self.conn();
        let target = u64::from_str_radix(phash_hex, 16).unwrap_or(0);
        let mut stmt = conn.prepare("SELECT id, phash FROM screenshots WHERE phash IS NOT NULL")?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
            .collect::<Result<Vec<_>>>()?;
        let mut similar = Vec::new();
        for (id, hash_hex) in rows {
            if let Ok(h) = u64::from_str_radix(&hash_hex, 16) {
                let dist = (target ^ h).count_ones();
                if dist <= threshold_bits { similar.push((id, hash_hex, dist)); }
            }
        }
        similar.sort_by_key(|(_, _, d)| *d);
        Ok(similar)
    }

    pub fn delete_screenshot(&self, id: &str) -> Result<()> {
        let conn = self.conn();
        conn.execute("DELETE FROM screenshots WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn get_categories(&self) -> Result<Vec<Category>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT category, COUNT(*) FROM screenshots
             WHERE category IS NOT NULL AND is_archived=0
             GROUP BY category ORDER BY 2 DESC",
        )?;
        let pairs: Vec<(String, i64)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<Result<Vec<_>>>()?;
        Ok(pairs.into_iter().map(|(name, count)| Category {
            color: category_color(&name),
            icon: category_icon(&name),
            name,
            count,
        }).collect())
    }

    pub fn get_stats(&self) -> Result<Stats> {
        let conn = self.conn();
        let total: i64 = conn.query_row(
            "SELECT COUNT(*) FROM screenshots WHERE is_archived=0", [], |r| r.get(0)).unwrap_or(0);
        let pending: i64 = conn.query_row(
            "SELECT COUNT(*) FROM screenshots WHERE status IN ('pending','processing') AND is_archived=0",
            [], |r| r.get(0)).unwrap_or(0);
        let low_conf: i64 = conn.query_row(
            "SELECT COUNT(*) FROM screenshots WHERE confidence IS NOT NULL AND confidence<0.6 AND is_archived=0",
            [], |r| r.get(0)).unwrap_or(0);
        let favs: i64 = conn.query_row(
            "SELECT COUNT(*) FROM screenshots WHERE is_favorite=1 AND is_archived=0",
            [], |r| r.get(0)).unwrap_or(0);
        let sensitive: i64 = conn.query_row(
            "SELECT COUNT(*) FROM screenshots WHERE has_sensitive=1 AND is_archived=0",
            [], |r| r.get(0)).unwrap_or(0);
        let dupes: i64 = conn.query_row(
            "SELECT COUNT(*) FROM (SELECT phash FROM screenshots WHERE phash IS NOT NULL GROUP BY phash HAVING COUNT(*)>1)",
            [], |r| r.get(0)).unwrap_or(0);
        let errors: i64 = conn.query_row(
            "SELECT COUNT(*) FROM screenshots WHERE status='error' AND is_archived=0",
            [], |r| r.get(0)).unwrap_or(0);

        let by_category = {
            let mut s = conn.prepare(
                "SELECT COALESCE(category,'Uncategorized'), COUNT(*) FROM screenshots
                 WHERE is_archived=0 GROUP BY category ORDER BY 2 DESC LIMIT 10")?;
            let x = s.query_map([], |r| Ok(CategoryCount { category: r.get(0)?, count: r.get(1)? }))?
                .collect::<Result<Vec<_>>>()?; x
        };
        let by_date = {
            let mut s = conn.prepare(
                "SELECT date(created_at), COUNT(*) FROM screenshots WHERE is_archived=0
                 GROUP BY date(created_at) ORDER BY 1 DESC LIMIT 30")?;
            let x = s.query_map([], |r| Ok(DateCount { date: r.get(0)?, count: r.get(1)? }))?
                .collect::<Result<Vec<_>>>()?; x
        };

        Ok(Stats {
            total, by_category, by_date,
            processing_pending: pending,
            low_confidence_count: low_conf,
            favorites_count: favs,
            sensitive_count: sensitive,
            duplicate_count: dupes,
            error_count: errors,
        })
    }

    pub fn load_settings(&self) -> AppSettings {
        if let Ok(Some(json)) = self.get_setting("app_settings") {
            serde_json::from_str(&json).unwrap_or_default()
        } else {
            AppSettings::default()
        }
    }

    pub fn save_settings(&self, s: &AppSettings) -> Result<()> {
        self.set_setting("app_settings", &serde_json::to_string(s).unwrap_or_default())
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let conn = self.conn();
        match conn.query_row("SELECT value FROM settings WHERE key=?1", params![key], |r| r.get(0)) {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn set_setting(&self, key: &str, val: &str) -> Result<()> {
        let conn = self.conn();
        conn.execute("INSERT OR REPLACE INTO settings (key,value) VALUES (?1,?2)", params![key, val])?;
        Ok(())
    }

    pub fn get_pending_screenshots(&self) -> Result<Vec<Screenshot>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id,timestamp,image_path,image_thumb,ocr_text,ocr_masked,has_sensitive,
             title,description,category,tags,source_hint,app_info,confidence,detected_language,
             phash,is_favorite,is_archived,status,error_msg,created_at
             FROM screenshots WHERE status='pending' ORDER BY created_at ASC LIMIT 10")?;
        let x = stmt.query_map([], row_to_ss)?.collect::<Result<Vec<_>>>(); x
    }

    pub fn get_screenshots_by_ids(&self, ids: &[String]) -> Result<Vec<Screenshot>> {
        if ids.is_empty() { return Ok(vec![]); }
        let conn = self.conn();
        let ph = ids.iter().enumerate().map(|(i, _)| format!("?{}", i + 1)).collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT id,timestamp,image_path,image_thumb,ocr_text,ocr_masked,has_sensitive,
             title,description,category,tags,source_hint,app_info,confidence,detected_language,
             phash,is_favorite,is_archived,status,error_msg,created_at
             FROM screenshots WHERE id IN ({})", ph
        );
        let mut stmt = conn.prepare(&sql)?;
        let p: Vec<&dyn rusqlite::ToSql> = ids.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
        let x = stmt.query_map(p.as_slice(), row_to_ss)?.collect::<Result<Vec<_>>>(); x
    }

    pub fn save_correction(&self, c: &UserCorrection) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "INSERT INTO user_corrections (screenshot_id,old_category,new_category,old_tags,new_tags,corrected_at)
             VALUES (?1,?2,?3,?4,?5,?6)",
            params![c.screenshot_id, c.old_category, c.new_category,
                    serde_json::to_string(&c.old_tags).unwrap_or_default(),
                    serde_json::to_string(&c.new_tags).unwrap_or_default(),
                    c.corrected_at],
        )?;
        Ok(())
    }

    pub fn get_corrections(&self, limit: i64) -> Result<Vec<UserCorrection>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT screenshot_id,old_category,new_category,old_tags,new_tags,corrected_at
             FROM user_corrections ORDER BY corrected_at DESC LIMIT ?1")?;
        let x = stmt.query_map(params![limit], |r| Ok(UserCorrection {
            screenshot_id: r.get(0)?,
            old_category: r.get(1)?,
            new_category: r.get(2)?,
            old_tags: r.get::<_, Option<String>>(3)?
                .and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default(),
            new_tags: r.get::<_, Option<String>>(4)?
                .and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default(),
            corrected_at: r.get(5)?,
        }))?.collect::<Result<Vec<_>>>(); x
    }

    pub fn get_all_thumbnails(&self) -> Result<Vec<(String, String)>> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT id, image_thumb FROM screenshots WHERE image_thumb IS NOT NULL")?;
        let x = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<Result<Vec<_>>>(); x
    }

    pub fn add_processing_log(&self, screenshot_id: Option<&str>, stage: &str, level: &str, message: &str) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "INSERT INTO processing_logs (screenshot_id,stage,level,message) VALUES (?1,?2,?3,?4)",
            params![screenshot_id, stage, level, message],
        )?;
        Ok(())
    }

    pub fn get_processing_logs(&self, limit: i64) -> Result<Vec<(String, Option<String>, String, String, String)>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT created_at,screenshot_id,stage,level,message FROM processing_logs ORDER BY id DESC LIMIT ?1")?;
        let x = stmt.query_map(params![limit], |r| Ok((
            r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?,
            r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?,
        )))?.collect::<Result<Vec<_>>>(); x
    }

    pub fn recover_stuck_processing(&self) -> Result<usize> {
        let conn = self.conn();
        Ok(conn.execute(
            "UPDATE screenshots SET status='error', error_msg='Recovered from stale processing state'
             WHERE status='processing'",
            [],
        )?)
    }

    pub fn get_learned_category_for_source(&self, source: &str) -> Result<Option<(String, i64)>> {
        if source.trim().is_empty() { return Ok(None); }
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT uc.new_category, COUNT(*) as c FROM user_corrections uc
             JOIN screenshots s ON s.id=uc.screenshot_id
             WHERE LOWER(COALESCE(s.source_hint,s.app_info,''))=LOWER(?1)
             GROUP BY uc.new_category ORDER BY c DESC LIMIT 1")?;
        let mut rows = stmt.query(params![source])?;
        if let Some(row) = rows.next()? {
            return Ok(Some((row.get(0)?, row.get(1)?)));
        }
        Ok(None)
    }

    pub fn get_learned_tags_for_source(&self, source: &str, min_count: i64) -> Result<Vec<String>> {
        if source.trim().is_empty() { return Ok(vec![]); }
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT uc.new_tags FROM user_corrections uc
             JOIN screenshots s ON s.id=uc.screenshot_id
             WHERE LOWER(COALESCE(s.source_hint,s.app_info,''))=LOWER(?1)
               AND uc.new_tags IS NOT NULL AND uc.new_tags != '[]'")?;
        let mut rows = stmt.query(params![source])?;
        let mut counts: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
        while let Some(row) = rows.next()? {
            let raw: String = row.get(0)?;
            if let Ok(tags) = serde_json::from_str::<Vec<String>>(&raw) {
                for tag in tags {
                    let t = tag.trim().to_lowercase();
                    if !t.is_empty() { *counts.entry(t).or_insert(0) += 1; }
                }
            }
        }
        let mut result: Vec<String> = counts.into_iter()
            .filter(|(_, c)| *c >= min_count)
            .map(|(t, _)| t)
            .collect();
        result.sort();
        Ok(result)
    }
}

const SEL_ALL_COLS: &str =
    "SELECT id,timestamp,image_path,image_thumb,ocr_text,ocr_masked,has_sensitive,
     title,description,category,tags,source_hint,app_info,confidence,detected_language,
     phash,is_favorite,is_archived,status,error_msg,created_at FROM screenshots WHERE id=?1";

fn row_to_ss(row: &rusqlite::Row) -> rusqlite::Result<Screenshot> {
    let tags: Vec<String> = row.get::<_, Option<String>>(10)?
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    Ok(Screenshot {
        id: row.get(0)?, timestamp: row.get(1)?, image_path: row.get(2)?,
        image_thumb: row.get(3)?, ocr_text: row.get(4)?, ocr_masked: row.get(5)?,
        has_sensitive: row.get::<_, i64>(6).unwrap_or(0) != 0,
        title: row.get(7)?, description: row.get(8)?, category: row.get(9)?,
        tags,
        source_hint: row.get(11)?, app_info: row.get(12)?, confidence: row.get(13)?,
        detected_language: row.get(14)?, phash: row.get(15)?,
        is_favorite: row.get::<_, i64>(16).unwrap_or(0) != 0,
        is_archived: row.get::<_, i64>(17).unwrap_or(0) != 0,
        status: row.get(18)?, error_msg: row.get(19)?, created_at: row.get(20)?,
    })
}

pub fn category_color(name: &str) -> String {
    let n = name.to_lowercase();
    if n.contains("music") || n.contains("müzik") || n.contains("muzik") { return "#a855f7".into(); }
    if n.contains("film") || n.contains("tv") || n.contains("dizi") { return "#3b82f6".into(); }
    if n.contains("code") || n.contains("tech") || n.contains("kod") || n.contains("tekno") { return "#22c55e".into(); }
    if n.contains("news") || n.contains("haber") { return "#ef4444".into(); }
    if n.contains("shop") || n.contains("alisveris") || n.contains("alışveriş") { return "#f97316".into(); }
    if n.contains("food") || n.contains("yemek") { return "#eab308".into(); }
    if n.contains("travel") || n.contains("seyahat") { return "#06b6d4".into(); }
    if n.contains("gaming") || n.contains("game") || n.contains("oyun") { return "#ec4899".into(); }
    if n.contains("book") || n.contains("kitap") { return "#8b5cf6".into(); }
    if n.contains("social") || n.contains("sosyal") { return "#14b8a6".into(); }
    if n.contains("work") || n.contains("calisma") || n.contains("çalışma") || n == "iş" || n.starts_with("iş/") { return "#64748b".into(); }
    if n.contains("education") || n.contains("egitim") || n.contains("eğitim") { return "#f59e0b".into(); }
    "#6b7280".into()
}

pub fn category_icon(name: &str) -> String {
    let n = name.to_lowercase();
    if n.contains("music") || n.contains("müzik") || n.contains("muzik") { return "🎵".into(); }
    if n.contains("film") || n.contains("tv") || n.contains("dizi") { return "🎬".into(); }
    if n.contains("code") || n.contains("tech") || n.contains("kod") || n.contains("tekno") { return "💻".into(); }
    if n.contains("news") || n.contains("haber") { return "📰".into(); }
    if n.contains("shop") || n.contains("alisveris") || n.contains("alışveriş") { return "🛒".into(); }
    if n.contains("food") || n.contains("yemek") { return "🍽️".into(); }
    if n.contains("travel") || n.contains("seyahat") { return "✈️".into(); }
    if n.contains("gaming") || n.contains("game") || n.contains("oyun") { return "🎮".into(); }
    if n.contains("book") || n.contains("kitap") { return "📚".into(); }
    if n.contains("social") || n.contains("sosyal") { return "💬".into(); }
    if n.contains("work") || n.contains("calisma") || n.contains("çalışma") || n == "iş" || n.starts_with("iş/") { return "💼".into(); }
    if n.contains("education") || n.contains("egitim") || n.contains("eğitim") { return "🎓".into(); }
    "📌".into()
}
