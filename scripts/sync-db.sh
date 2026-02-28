#!/bin/bash
echo "Starting Prisma DB Sync..."
npx prisma@5.18.0 db push --accept-data-loss
