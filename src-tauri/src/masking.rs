use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SensitiveMatch { pub kind: String, pub start: usize, pub end: usize, pub masked: String }

/// FIX: actually detect sensitive patterns and return match positions.
/// Previously this always returned vec![] — now it walks line-by-line,
/// detects each kind, and returns the byte range + masked replacement.
pub fn detect_sensitive(text: &str) -> Vec<SensitiveMatch> {
    let mut matches = Vec::new();
    let mut offset = 0usize;

    for line in text.lines() {
        if has_credit_card(line) {
            matches.push(SensitiveMatch {
                kind: "credit_card".to_string(),
                start: offset,
                end: offset + line.len(),
                masked: mask_credit_cards_in(line),
            });
        }
        if has_iban(line) {
            matches.push(SensitiveMatch {
                kind: "iban".to_string(),
                start: offset,
                end: offset + line.len(),
                masked: mask_iban_in(line),
            });
        }
        if has_api_key(line) {
            matches.push(SensitiveMatch {
                kind: "api_key".to_string(),
                start: offset,
                end: offset + line.len(),
                masked: mask_api_keys_in(line),
            });
        }
        if has_password(line) {
            matches.push(SensitiveMatch {
                kind: "password".to_string(),
                start: offset,
                end: offset + line.len(),
                masked: mask_passwords_in(line),
            });
        }
        if has_tc_no(line) {
            matches.push(SensitiveMatch {
                kind: "tc_id".to_string(),
                start: offset,
                end: offset + line.len(),
                masked: mask_tc_in(line),
            });
        }
        offset += line.len() + 1; // +1 for the newline character
    }

    matches
}

pub fn mask_sensitive(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    for line in text.lines() { result.push_str(&mask_line(line)); result.push('\n'); }
    if !text.ends_with('\n') && result.ends_with('\n') { result.pop(); }
    result
}

fn mask_line(line: &str) -> String {
    let mut out = line.to_string();
    out = mask_credit_cards_in(&out);
    out = mask_iban_in(&out);
    out = mask_api_keys_in(&out);
    out = mask_passwords_in(&out);
    out = mask_tc_in(&out);
    out
}

pub fn has_sensitive_content(text: &str) -> bool {
    if text.is_empty() { return false; }
    text.lines().any(contains_sensitive)
}

fn contains_sensitive(line: &str) -> bool {
    has_credit_card(line) || has_iban(line) || has_api_key(line) || has_password(line) || has_tc_no(line)
}

fn has_credit_card(text: &str) -> bool {
    extract_digits_groups(text).iter().any(|d| (13..=19).contains(&d.len()) && luhn_check(d))
}

fn mask_credit_cards_in(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut result = String::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i].is_ascii_digit() {
            let start = i;
            let mut digits = String::new();
            let mut j = i;
            while j < chars.len() && j < start + 25 {
                if chars[j].is_ascii_digit() { digits.push(chars[j]); }
                else if chars[j] == ' ' || chars[j] == '-' {}
                else { break; }
                j += 1;
            }
            if (13..=19).contains(&digits.len()) && luhn_check(&digits) {
                result.push_str(&format!("**** **** **** {}", &digits[digits.len()-4..]));
                i = j; continue;
            }
        }
        result.push(chars[i]); i += 1;
    }
    result
}

fn extract_digits_groups(text: &str) -> Vec<String> {
    let mut groups = Vec::new(); let mut current = String::new();
    for c in text.chars() {
        if c.is_ascii_digit() { current.push(c); }
        else if c == ' ' || c == '-' {}
        else if !current.is_empty() { groups.push(current.clone()); current.clear(); }
    }
    if !current.is_empty() { groups.push(current); }
    groups
}

fn has_iban(text: &str) -> bool {
    let upper = text.to_uppercase();
    ["TR","DE","GB","FR"].iter().any(|kw| extract_iban(&upper, kw).is_some())
}
fn extract_iban(text: &str, country: &str) -> Option<String> {
    extract_iban_with_pos(text, country).map(|(_, _, s)| s)
}
fn extract_iban_with_pos(text: &str, country: &str) -> Option<(usize, usize, String)> {
    let expected = match country { "TR" => 26, "DE" => 22, "FR" => 27, "GB" => 22, _ => 0 };
    if expected == 0 { return None; }
    let bytes = text.as_bytes();
    let mut i = 0;
    while i + 2 <= bytes.len() {
        if bytes[i..].starts_with(country.as_bytes()) {
            let mut iban = String::new(); let mut j = i;
            while j < bytes.len() && iban.len() <= expected + 4 {
                let b = bytes[j];
                if b.is_ascii_alphanumeric() { iban.push(b as char); }
                else if b == b' ' {}
                else { break; }
                j += 1;
            }
            if iban.len() == expected { return Some((i, j, iban)); }
        }
        i += 1;
    }
    None
}
fn mask_iban_in(text: &str) -> String {
    let mut out = text.to_string();
    for kw in &["TR","DE","GB","FR"] {
        let upper = out.to_uppercase();
        if let Some((start, end, iban)) = extract_iban_with_pos(&upper, kw) {
            let masked = format!("{}** **** ****", &iban[..4.min(iban.len())]);
            out = format!("{}{}{}", &out[..start], masked, &out[end..]);
        }
    }
    out
}

const API_PATTERNS: &[(&str, &str, usize, usize)] = &[
    ("sk-","openai_key",40,60), ("akia","aws_key",20,20),
    ("ghp_","github_pat",36,40), ("bearer ","bearer",20,300),
];
fn has_api_key(line: &str) -> bool {
    let lower = line.to_lowercase();
    API_PATTERNS.iter().any(|(prefix, _, min_len, _)| {
        if let Some(pos) = lower.find(prefix) {
            let rest: String = line[pos + prefix.len()..].chars().take(300).take_while(|c| !c.is_whitespace() && *c != '"').collect();
            rest.len() >= *min_len
        } else { false }
    })
}
fn mask_api_keys_in(text: &str) -> String {
    let mut out = text.to_string();
    for (prefix, _kind, min_len, _) in API_PATTERNS {
        let lower = out.to_lowercase();
        if let Some(pos) = lower.find(prefix) {
            let key_start = pos + prefix.len();
            let key: String = out[key_start..].chars().take(300).take_while(|c| !c.is_whitespace() && *c != '"').collect();
            if key.len() >= *min_len {
                out = format!("{}{}[REDACTED]{}", &out[..pos], prefix, &out[key_start + key.len()..]);
            }
        }
    }
    out
}

const PASSWORD_KEYWORDS: &[&str] = &["password:","şifre:","parola:","pwd:","pass:","password="];
fn has_password(line: &str) -> bool {
    let lower = line.to_lowercase();
    PASSWORD_KEYWORDS.iter().any(|kw| {
        if let Some(pos) = lower.find(kw) {
            let val: String = lower[pos + kw.len()..].trim_start().chars().take(64).collect();
            val.len() >= 4
        } else { false }
    })
}
fn mask_passwords_in(text: &str) -> String {
    let mut out = text.to_string();
    let lower = out.to_lowercase();
    for kw in PASSWORD_KEYWORDS {
        if let Some(pos) = lower.find(kw) {
            let val_start = pos + kw.len();
            let val: String = out[val_start..].trim_start().chars().take(64).collect();
            if val.len() >= 4 {
                let spaces = out[val_start..].chars().take_while(|c| c.is_whitespace()).count();
                let end_pos = val_start + out[val_start..].char_indices().nth(spaces + val.len()).map(|(i,_)| i).unwrap_or(out.len() - val_start);
                out = format!("{}{}[***]{}", &out[..val_start], &out[val_start..val_start + spaces], &out[end_pos..]);
                break;
            }
        }
    }
    out
}

fn has_tc_no(text: &str) -> bool {
    let digits: Vec<char> = text.chars().filter(|c| c.is_ascii_digit()).collect();
    digits.windows(11).any(|w| { let s: String = w.iter().collect(); s.chars().next().map(|c| c != '0').unwrap_or(false) && validate_tc_no(&s) })
}
fn mask_tc_in(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect(); let mut result = String::new(); let mut i = 0;
    while i < chars.len() {
        if chars[i].is_ascii_digit() && chars[i] != '0' {
            let mut digits = String::new(); let mut j = i;
            while j < chars.len() && chars[j].is_ascii_digit() { digits.push(chars[j]); j += 1; if digits.len() == 11 { break; } }
            if digits.len() == 11 && validate_tc_no(&digits) {
                result.push_str(&format!("{}*****{}", &digits[..3], &digits[9..]));
                i = j; continue;
            }
        }
        result.push(chars[i]); i += 1;
    }
    result
}
fn validate_tc_no(tc: &str) -> bool {
    let d: Vec<u32> = tc.chars().filter_map(|c| c.to_digit(10)).collect();
    if d.len() != 11 || d[0] == 0 { return false; }
    let sum1: u32 = d[0]+d[2]+d[4]+d[6]+d[8]; let sum2: u32 = d[1]+d[3]+d[5]+d[7];
    (sum1.wrapping_mul(7).wrapping_sub(sum2)) % 10 == d[9] && d[..10].iter().sum::<u32>() % 10 == d[10]
}
fn luhn_check(digits: &str) -> bool {
    let mut sum = 0u32; let mut double = false;
    for c in digits.chars().rev() {
        let Some(d) = c.to_digit(10) else { return false; };
        sum += if double { let d2 = d * 2; if d2 > 9 { d2 - 9 } else { d2 } } else { d };
        double = !double;
    }
    sum % 10 == 0
}
