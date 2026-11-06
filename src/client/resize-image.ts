// 上传前在浏览器里把照片缩到长边 ≤2048px、转 JPEG：体积小，并去掉 EXIF（含 GPS 位置）
export async function resizeImage(file: File, max = 2048, quality = 0.85): Promise<File> {
  const bmp = await createImageBitmap(file).catch(() => undefined);
  if (!bmp) return file; // 浏览器解不了（如 HEIC）就原样上传，由服务端按类型拒绝
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
  return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
}
