#!/bin/bash
# Safety Metrics Update Script
# To be run via cron job every 90 days

# Navigate to script directory
cd "$(dirname "$0")"

# Activate virtual environment if needed
# source /path/to/venv/bin/activate

# Run the safety metrics processor
echo "Starting safety metrics update at $(date)"
python la_safety_processor.py

# Check result
if [ $? -eq 0 ]; then
    echo "Safety metrics update completed successfully at $(date)"
else
    echo "Safety metrics update failed at $(date)"
    exit 1
fi

# Optional: Backup safety metrics table
# pg_dump -t safety_metrics -h $DB_HOST -U $DB_USER $DB_NAME > safety_metrics_backup_$(date +%Y%m%d).sql

exit 0 