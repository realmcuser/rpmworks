#!/bin/bash
set -e

# Konfiguration
SERVER="http://knivstakvm2.vpn.fhd.se:8005"
USERNAME="admin"
PASSWORD="adsanker"
PROJECT_ID="${1:-2}"
POLL_INTERVAL=5

echo "=== RPM Works Remote Build ==="
echo "Server: $SERVER"
echo "Projekt: $PROJECT_ID"
echo ""

# 1. Hamta token
echo "Loggar in..."
TOKEN=$(curl -s -X POST "${SERVER}/api/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d "username=${USERNAME}&password=${PASSWORD}" | jq -r '.access_token')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "Inloggning misslyckades!"
  exit 1
fi
echo "Inloggad."

# 2. Hamta projektnamn
PROJECT_NAME=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "${SERVER}/api/projects/${PROJECT_ID}" | jq -r '.name')

echo ""
echo "Startar bygge av: $PROJECT_NAME (id: $PROJECT_ID)"
BUILD_RESPONSE=$(curl -s -X POST "${SERVER}/api/build/start" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"project_id\": ${PROJECT_ID}}")

BUILD_ID=$(echo "$BUILD_RESPONSE" | jq -r '.build_ids[0]')

if [ "$BUILD_ID" = "null" ] || [ -z "$BUILD_ID" ]; then
  echo "Kunde inte starta bygge: $BUILD_RESPONSE"
  exit 1
fi
echo "Bygge startat (build_id: $BUILD_ID)"

# 3. Vanta tills bygget ar klart
echo -n "Vantar"
while true; do
  STATUS=$(curl -s -H "Authorization: Bearer $TOKEN" \
    "${SERVER}/api/projects/${PROJECT_ID}" | \
    jq -r ".builds[] | select(.id == ${BUILD_ID}) | .status")

  if [ "$STATUS" = "success" ]; then
    echo ""
    echo "Bygge KLART!"
    break
  elif [ "$STATUS" = "failed" ]; then
    echo ""
    echo "Bygge MISSLYCKAT!"
    # Visa logg
    curl -s -H "Authorization: Bearer $TOKEN" \
      "${SERVER}/api/projects/${PROJECT_ID}" | \
      jq -r ".builds[] | select(.id == ${BUILD_ID}) | .build_log" | tail -5
    exit 1
  fi

  echo -n "."
  sleep $POLL_INTERVAL
done

# 4. Hamta filnamn och ladda ner
FILE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "${SERVER}/api/projects/${PROJECT_ID}" | \
  jq -r ".builds[] | select(.id == ${BUILD_ID}) | .rpm_files[0]" | \
  xargs basename)

echo "Laddar ner: $FILE"
curl -s -O -H "Authorization: Bearer $TOKEN" \
  "${SERVER}/api/builds/${BUILD_ID}/download/${FILE}"

echo "Klar! Fil sparad: $FILE"
ls -lh "$FILE"
