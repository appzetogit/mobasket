import {
  LOCAL_CLOUDINARY_PUBLIC_ID_MAP,
  LOCAL_CLOUDINARY_URL_MAP,
} from "../assets/localCloudinaryAssetMap";

const CLOUDINARY_HOST_PATTERN = /(?:^|\.)cloudinary\.com$/i;

const normalizeSrc = (value) => String(value || "").trim();

const inferCloudinaryPublicId = (src) => {
  const normalizedSrc = normalizeSrc(src);
  if (!normalizedSrc) return "";

  try {
    const parsed = new URL(normalizedSrc);
    if (!CLOUDINARY_HOST_PATTERN.test(parsed.hostname)) return "";

    const parts = parsed.pathname.split("/").filter(Boolean);
    const uploadIndex = parts.findIndex((part) => part === "upload");
    if (uploadIndex === -1) return "";

    const trailing = parts.slice(uploadIndex + 1);
    const versionIndex = trailing.findIndex((part) => /^v\d+$/i.test(part));
    const publicIdParts =
      versionIndex === -1 ? trailing : trailing.slice(versionIndex + 1);

    if (publicIdParts.length === 0) return "";

    return publicIdParts.join("/").replace(/\.[^.]+$/, "");
  } catch {
    return "";
  }
};

export const resolveLocalAssetUrl = (src) => {
  const normalizedSrc = normalizeSrc(src);
  if (!normalizedSrc) return "";

  const directMatch = LOCAL_CLOUDINARY_URL_MAP[normalizedSrc];
  if (typeof directMatch === "string" && directMatch.trim()) {
    return directMatch.trim();
  }

  const publicId = inferCloudinaryPublicId(normalizedSrc);
  if (!publicId) return normalizedSrc;

  const publicIdMatch = LOCAL_CLOUDINARY_PUBLIC_ID_MAP[publicId];
  if (typeof publicIdMatch === "string" && publicIdMatch.trim()) {
    return publicIdMatch.trim();
  }

  return normalizedSrc;
};

export const resolveLocalAssetList = (values = []) =>
  (Array.isArray(values) ? values : []).map(resolveLocalAssetUrl);
