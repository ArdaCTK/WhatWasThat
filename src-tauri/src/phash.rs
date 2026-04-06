use image::DynamicImage;
use std::path::Path;
const HASH_SIZE: u32 = 8;

pub fn compute_phash(path: &Path) -> Option<u64> {
    let img = image::open(path).ok()?;
    Some(phash_from_image(&img))
}
pub fn compute_phash_from_bytes(bytes: &[u8], width: usize, height: usize) -> Option<u64> {
    let rgba = image::RgbaImage::from_raw(width as u32, height as u32, bytes.to_vec())?;
    Some(phash_from_image(&DynamicImage::ImageRgba8(rgba)))
}
fn phash_from_image(img: &DynamicImage) -> u64 {
    let small = img.resize_exact(HASH_SIZE+1, HASH_SIZE, image::imageops::FilterType::Lanczos3);
    let gray = small.to_luma8();
    let mut hash: u64 = 0;
    for y in 0..HASH_SIZE {
        for x in 0..HASH_SIZE {
            if gray.get_pixel(x,y).0[0] as u16 > gray.get_pixel(x+1,y).0[0] as u16 {
                hash |= 1 << (y * HASH_SIZE + x);
            }
        }
    }
    hash
}
pub fn hamming_distance(a: u64, b: u64) -> u32 { (a ^ b).count_ones() }
pub fn is_duplicate(a: u64, b: u64, threshold: u32) -> bool { hamming_distance(a,b) <= threshold }
pub fn parse_hash(s: &str) -> Option<u64> { u64::from_str_radix(s.trim(), 16).ok() }
pub fn hash_to_hex(h: u64) -> String { format!("{:016x}", h) }
