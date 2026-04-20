use dashmap::DashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

struct CacheEntry { data: String, generation: u64, size_bytes: usize }

pub struct ThumbnailCache {
    inner: Arc<DashMap<String, CacheEntry>>,
    max_entries: usize,
    generation: Arc<AtomicU64>,
}

impl ThumbnailCache {
    pub fn new() -> Self { Self::with_capacity(500) }
    pub fn with_capacity(max_entries: usize) -> Self {
        Self {
            inner: Arc::new(DashMap::new()),
            max_entries,
            generation: Arc::new(AtomicU64::new(0)),
        }
    }
    pub fn set(&self, id: &str, data: String) {
        let gen = self.generation.fetch_add(1, Ordering::Relaxed);
        let size = data.len();
        self.inner.insert(id.to_string(), CacheEntry { data, generation: gen, size_bytes: size });
        if self.inner.len() > self.max_entries { self.evict_lru(self.max_entries / 10); }
    }
    pub fn get(&self, id: &str) -> Option<String> { self.inner.get(id).map(|e| e.data.clone()) }
    pub fn remove(&self, id: &str) { self.inner.remove(id); }
    pub fn clear(&self) { self.inner.clear(); }
    pub fn len(&self) -> usize { self.inner.len() }
    pub fn total_size(&self) -> usize {
        self.inner.iter().map(|e| e.value().size_bytes).sum::<usize>()
    }

    // FIX: replaced full O(n log n) sort with O(n) partial selection.
    // The old code collected all entries, sorted them by generation (full sort),
    // then deleted the first `count`. For a 500-entry cache this runs on every
    // 50th insert — not catastrophic, but wasteful since we only need the
    // bottom `count` elements, not a fully sorted list.
    // `select_nth_unstable_by_key` (stable since Rust 1.49) partitions in O(n)
    // and leaves entries 0..count as the oldest without sorting the rest.
    fn evict_lru(&self, count: usize) {
        if count == 0 { return; }
        let mut entries: Vec<(String, u64)> = self.inner.iter()
            .map(|e| (e.key().clone(), e.value().generation))
            .collect();

        let len = entries.len();
        if count >= len {
            // Evict everything
            self.inner.clear();
            return;
        }

        // Partial selection: entries[0..count] will be the `count` oldest (lowest gen)
        entries.select_nth_unstable_by_key(count - 1, |&(_, gen)| gen);

        for (key, _) in entries.into_iter().take(count) {
            self.inner.remove(&key);
        }
    }

    pub fn warm_up(&self, entries: Vec<(String, String)>) {
        for (id, data) in entries { self.set(&id, data); }
        log::info!("Cache warmed: {} entries ({:.1} MB)", self.len(), self.total_size() as f64 / 1_048_576.0);
    }
}

impl Default for ThumbnailCache { fn default() -> Self { Self::new() } }

use std::sync::OnceLock;
static THUMB_CACHE: OnceLock<Arc<ThumbnailCache>> = OnceLock::new();
pub fn get_cache() -> Arc<ThumbnailCache> {
    THUMB_CACHE.get_or_init(|| Arc::new(ThumbnailCache::new())).clone()
}
