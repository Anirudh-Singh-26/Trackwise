import Screenshot from "../../models/Screenshot.js";
import ScreenshotPolicy from "../../models/ScreenshotPolicy.js";
import { getCloudinary } from "../../config/cloudinary.js";

let cleanupRunning = false;

/**
 * Remove expired screenshot assets and their metadata. Then reconcile old tagged
 * assets in the dedicated Trackwise folder that have no matching MongoDB record.
 * The orphan sweep is deliberately restricted to this app's folder + tag.
 */
export async function cleanupExpiredScreenshots({ batchSize = 100 } = {}) {
  if (cleanupRunning) return { skipped: true, deleted: 0, failed: 0, orphanDeleted: 0 };
  cleanupRunning = true;
  let deleted = 0;
  let failed = 0;
  let orphanDeleted = 0;
  try {
    const now = new Date();
    const expired = await Screenshot.find({ expiresAt: { $lte: now } })
      .sort({ expiresAt: 1 }).limit(batchSize).lean();
    const cloudinary = getCloudinary();

    for (const item of expired) {
      try {
        const result = await cloudinary.uploader.destroy(item.publicId, {
          resource_type: item.resourceType || "image",
          type: "authenticated",
          invalidate: true,
        });
        // Cloudinary's `not found` means the asset is already gone; metadata can be removed.
        if (!result || !["ok", "not found"].includes(result.result)) {
          throw new Error(`Cloudinary deletion returned ${result?.result || "no result"}`);
        }
        await Screenshot.deleteOne({ _id: item._id });
        deleted++;
      } catch (error) {
        failed++;
        console.error(JSON.stringify({ level: "error", event: "screenshot_retention_delete_failed", screenshotId: String(item._id), errorName: error?.name || "Error", message: error?.message }));
      }
    }

    // Reconcile orphaned assets left by interrupted DB writes. The query only targets
    // screenshots explicitly tagged by Trackwise in its dedicated Cloudinary folder.
    try {
      const policy = await ScreenshotPolicy.findOne({ key: "screenshot-monitoring" }).select("retentionDays").lean();
      const retentionDays = Number.isInteger(policy?.retentionDays) ? policy.retentionDays : 7;
      const cutoff = new Date(Date.now() - retentionDays * 86400000);
      const cutoffDate = cutoff.toISOString().slice(0, 10);
      const candidates = await cloudinary.search
        .expression(`asset_folder="Trackwise" AND tags=trackwise-screenshot AND created_at<${cutoffDate}`)
        .sort_by("created_at", "asc")
        .max_results(Math.min(Math.max(batchSize, 1), 100))
        .execute();
      const assets = candidates?.resources || [];
      if (assets.length) {
        const publicIds = assets.map(asset => asset.public_id).filter(Boolean);
        const known = await Screenshot.find({ publicId: { $in: publicIds } }).select("publicId").lean();
        const knownIds = new Set(known.map(item => item.publicId));
        for (const asset of assets) {
          if (!asset.public_id || knownIds.has(asset.public_id)) continue;
          try {
            const result = await cloudinary.uploader.destroy(asset.public_id, {
              resource_type: asset.resource_type || "image",
              type: asset.type || "authenticated",
              invalidate: true,
            });
            if (!result || !["ok", "not found"].includes(result.result)) {
              throw new Error(`Cloudinary deletion returned ${result?.result || "no result"}`);
            }
            orphanDeleted++;
          } catch (error) {
            failed++;
            console.error(JSON.stringify({ level: "error", event: "screenshot_orphan_cleanup_failed", publicId: asset.public_id, errorName: error?.name || "Error", message: error?.message }));
          }
        }
      }
    } catch (error) {
      failed++;
      console.error(JSON.stringify({ level: "error", event: "screenshot_orphan_scan_failed", errorName: error?.name || "Error", message: error?.message }));
    }

    return { skipped: false, deleted, failed, orphanDeleted };
  } finally {
    cleanupRunning = false;
  }
}
