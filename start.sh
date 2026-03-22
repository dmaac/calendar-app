#!/bin/bash

echo "🚀 Fitsi IA - Starting Services"
echo "=================================="

# Backend status check
echo "📡 Backend API Status:"
if curl -s http://localhost:8000/ > /dev/null; then
    echo "✅ Backend running at http://localhost:8000"
    echo "📚 API Documentation: http://localhost:8000/docs"
    echo "📋 ReDoc: http://localhost:8000/redoc"
else
    echo "❌ Backend not running. Start with: cd backend && source venv/bin/activate && uvicorn app.main:app --reload"
fi

echo ""

# Frontend status check
echo "📱 Frontend Status:"
if curl -s http://localhost:8081/ > /dev/null; then
    echo "✅ Expo server running at http://localhost:8081"
    echo "📲 Use Expo Go app to scan QR code"
else
    echo "❌ Frontend not running. Start with: cd mobile && npm start"
fi

echo ""
echo "🔧 Quick Commands:"
echo "• Backend: curl http://localhost:8000/"
echo "• Register: curl -X POST http://localhost:8000/auth/register -H 'Content-Type: application/json' -d '{\"email\":\"test@example.com\",\"first_name\":\"Test\",\"last_name\":\"User\",\"password\":\"password123\"}'"
echo "• View database: ls -la backend/calendar.db"