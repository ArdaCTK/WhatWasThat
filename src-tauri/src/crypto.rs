use aes_gcm::{aead::{Aead, AeadCore, KeyInit, OsRng}, Aes256Gcm, Key, Nonce};
use argon2::{password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString}, Argon2};
use pbkdf2::pbkdf2_hmac;
use sha2::Sha256;
use std::io::Write;
use std::path::{Path, PathBuf};
use zeroize::Zeroizing;

const PBKDF2_ROUNDS: u32 = 100_000;
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;

fn derive_key(password: &str, salt: &[u8]) -> Zeroizing<[u8; 32]> {
    let mut key = Zeroizing::new([0u8; 32]);
    pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, PBKDF2_ROUNDS, key.as_mut());
    key
}

pub fn encrypt(plaintext: &[u8], password: &str) -> Result<Vec<u8>, String> {
    let salt: [u8; SALT_LEN] = rand::random();
    let key_bytes = derive_key(password, &salt);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key_bytes.as_ref()));
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher.encrypt(&nonce, plaintext).map_err(|e| format!("Encrypt error: {:?}", e))?;
    let mut out = Vec::with_capacity(SALT_LEN + NONCE_LEN + ciphertext.len());
    out.extend_from_slice(&salt);
    out.extend_from_slice(nonce.as_slice());
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

pub fn decrypt(data: &[u8], password: &str) -> Result<Vec<u8>, String> {
    if data.len() < SALT_LEN + NONCE_LEN + 16 { return Err("Data too short".into()); }
    let (salt, rest) = data.split_at(SALT_LEN);
    let (nonce_b, cipher_b) = rest.split_at(NONCE_LEN);
    let key_bytes = derive_key(password, salt);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key_bytes.as_ref()));
    cipher.decrypt(Nonce::from_slice(nonce_b), cipher_b).map_err(|_| "Decryption failed — wrong password or corrupt data".into())
}

fn sync_parent_dir(path: &Path) {
    if let Some(parent) = path.parent() {
        if let Ok(dir) = std::fs::File::open(parent) { let _ = dir.sync_all(); }
    }
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Invalid path")?;
    let tmp_name = format!(".{}.tmp-{:016x}", path.file_name().and_then(|x| x.to_str()).unwrap_or("blob"), rand::random::<u64>());
    let tmp_path = parent.join(tmp_name);
    let mut f = std::fs::File::create(&tmp_path).map_err(|e| format!("Temp write failed: {}", e))?;
    f.write_all(bytes).map_err(|e| format!("Temp write failed: {}", e))?;
    f.sync_all().map_err(|e| format!("Temp fsync failed: {}", e))?;
    match std::fs::rename(&tmp_path, path) {
        Ok(_) => {}
        Err(_) => {
            std::fs::remove_file(path).map_err(|e| format!("Remove failed: {}", e))?;
            std::fs::rename(&tmp_path, path).map_err(|e| format!("Rename failed: {}", e))?;
        }
    }
    sync_parent_dir(path);
    Ok(())
}

pub fn encrypt_file(path: &Path, password: &str) -> Result<(), String> {
    let plaintext = Zeroizing::new(std::fs::read(path).map_err(|e| format!("Read failed: {}", e))?);
    let ciphertext = encrypt(plaintext.as_ref(), password)?;
    write_atomic(path, &ciphertext)
}

pub fn decrypt_file(path: &Path, password: &str) -> Result<(), String> {
    let data = Zeroizing::new(std::fs::read(path).map_err(|e| format!("Read failed: {}", e))?);
    let plaintext = decrypt(data.as_ref(), password)?;
    write_atomic(path, &plaintext)
}

pub fn is_image_extension(path: &Path) -> bool {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    ext == "png" || ext == "jpg" || ext == "jpeg"
}

pub fn is_encrypted(path: &Path) -> bool {
    let Ok(f) = std::fs::read(path) else { return false; };
    if f.len() < 4 { return false; }
    !f.starts_with(b"\x89PNG") && !f.starts_with(b"\xFF\xD8")
}

pub fn list_encryptable_images(dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut out = Vec::new();
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.is_file() && is_image_extension(&path) && !is_encrypted(&path) { out.push(path); }
    }
    Ok(out)
}

pub fn list_decryptable_images(dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut out = Vec::new();
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.is_file() && is_image_extension(&path) && is_encrypted(&path) { out.push(path); }
    }
    Ok(out)
}

pub fn hash_password(password: &str) -> String {
    let salt = SaltString::generate(&mut argon2::password_hash::rand_core::OsRng);
    match Argon2::default().hash_password(password.as_bytes(), &salt) {
        Ok(h) => h.to_string(), Err(_) => String::new(),
    }
}

fn verify_password_pbkdf2_legacy(password: &str, stored: &str) -> bool {
    let parts: Vec<&str> = stored.splitn(2, ':').collect();
    if parts.len() != 2 { return false; }
    let Ok(salt) = hex::decode(parts[0]) else { return false; };
    let Ok(expected) = hex::decode(parts[1]) else { return false; };
    let key = derive_key(password, &salt);
    key.as_ref() == expected.as_slice()
}

pub fn is_legacy_pbkdf2_hash(stored: &str) -> bool { stored.contains(':') && !stored.starts_with("$argon2") }

pub fn verify_password(password: &str, stored: &str) -> bool {
    if stored.starts_with("$argon2") {
        let Ok(parsed) = PasswordHash::new(stored) else { return false; };
        return Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok();
    }
    verify_password_pbkdf2_legacy(password, stored)
}
