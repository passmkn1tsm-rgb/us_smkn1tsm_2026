export interface CompressedImageResult {
  blob: Blob;
  ext: string;
  mimeType: string;
  width: number;
  height: number;
  sizeKb: number;
}

/**
 * Mengompresi gambar di browser (maks lebar 1280px, format WebP ringan)
 * sebelum diunggah ke Supabase Storage agar hemat kuota & cepat dibuka ratusan siswa.
 */
export async function compressImageFile(
  file: File,
  maxWidth = 1280,
  quality = 0.82
): Promise<CompressedImageResult> {
  // SVG tidak perlu rasterisasi karena ukurannya sudah kecil dan tetap tajam vektor
  if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
    return {
      blob: file,
      ext: 'svg',
      mimeType: 'image/svg+xml',
      width: 0,
      height: 0,
      sizeKb: Math.max(1, Math.round(file.size / 1024))
    };
  }

  const img = await loadImageFromFile(file);
  const scale = img.naturalWidth > maxWidth ? maxWidth / img.naturalWidth : 1;
  const targetWidth = Math.max(1, Math.round(img.naturalWidth * scale));
  const targetHeight = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      blob: file,
      ext: file.name.split('.').pop() || 'png',
      mimeType: file.type || 'image/png',
      width: targetWidth,
      height: targetHeight,
      sizeKb: Math.max(1, Math.round(file.size / 1024))
    };
  }

  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  const webpBlob = await canvasToBlob(canvas, 'image/webp', quality);
  if (webpBlob && webpBlob.size > 0) {
    return {
      blob: webpBlob,
      ext: 'webp',
      mimeType: 'image/webp',
      width: targetWidth,
      height: targetHeight,
      sizeKb: Math.max(1, Math.round(webpBlob.size / 1024))
    };
  }

  const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', quality);
  const finalBlob = jpegBlob || file;
  return {
    blob: finalBlob,
    ext: jpegBlob ? 'jpg' : file.name.split('.').pop() || 'png',
    mimeType: finalBlob.type || 'image/jpeg',
    width: targetWidth,
    height: targetHeight,
    sizeKb: Math.max(1, Math.round(finalBlob.size / 1024))
  };
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Gagal membaca data gambar.'));
    reader.readAsDataURL(blob);
  });
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('File bukan gambar yang valid atau rusak.'));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}
