#!/usr/bin/env bash
# ============================================================
# Firestore Backup Script
# ============================================================
# Exports all Firestore collections to a Cloud Storage bucket.
# Run manually or schedule via cron / Cloud Scheduler.
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - GCS bucket created: gs://${PROJECT_ID}-firestore-backups
#
# Usage:
#   ./scripts/firestore-backup.sh [project-id]
#
# Example crontab (daily at 03:00 UTC):
#   0 3 * * * /path/to/scripts/firestore-backup.sh my-project-id >> /var/log/firestore-backup.log 2>&1
# ============================================================

set -euo pipefail

PROJECT_ID="${1:-${FIREBASE_PROJECT_ID:-}}"
BUCKET="gs://${PROJECT_ID}-firestore-backups"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%S")
EXPORT_PATH="${BUCKET}/${TIMESTAMP}"

if [ -z "$PROJECT_ID" ]; then
  echo "❌ Error: PROJECT_ID is required."
  echo "Usage: $0 <project-id>"
  exit 1
fi

echo "🔄 Starting Firestore export..."
echo "   Project:     ${PROJECT_ID}"
echo "   Destination: ${EXPORT_PATH}"
echo ""

gcloud firestore export "${EXPORT_PATH}" \
  --project="${PROJECT_ID}" \
  --async

echo ""
echo "✅ Export initiated → ${EXPORT_PATH}"
echo ""

# ---- Cleanup old backups (retain last 30 days) ----
echo "🧹 Cleaning up backups older than 30 days..."
CUTOFF_DATE=$(date -u -d "30 days ago" +"%Y-%m-%d" 2>/dev/null || date -u -v-30d +"%Y-%m-%d")

gsutil ls "${BUCKET}/" 2>/dev/null | while read -r backup_path; do
  backup_date=$(basename "$backup_path" | cut -d'T' -f1)
  if [[ "$backup_date" < "$CUTOFF_DATE" ]]; then
    echo "   Deleting: ${backup_path}"
    gsutil -m rm -r "${backup_path}" || true
  fi
done

echo "✅ Backup cleanup complete."
