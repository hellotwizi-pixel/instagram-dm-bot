#!/bin/bash

# Test Instagram Webhook

VERIFY_TOKEN=${IG_VERIFY_TOKEN:-"test_token"}
CHALLENGE="test_challenge"

echo "🧪 Testing Instagram Webhook..."
echo "Using verify token: $VERIFY_TOKEN"
echo ""

# Test verification endpoint
echo "📬 Testing webhook verification..."
curl -s -X GET "http://localhost:3000/api/webhook?hub.verify_token=$VERIFY_TOKEN&hub.challenge=$CHALLENGE" \
  -H "Content-Type: application/json"

echo ""
echo ""

# Test webhook POST
echo "📨 Testing webhook POST..."
curl -s -X POST "http://localhost:3000/api/webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "object": "instagram",
    "entry": [
      {
        "id": "123456789",
        "time": 1234567890,
        "messaging": [
          {
            "sender": {"id": "user123"},
            "recipient": {"id": "page123"},
            "message": {
              "text": "Hello bot!",
              "mid": "m123"
            }
          }
        ]
      }
    ]
  }'

echo ""
echo "✅ Webhook test complete"
