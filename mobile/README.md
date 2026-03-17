# Calendar Mobile App

React Native mobile application built with Expo, featuring calendar management, user authentication, and activity scheduling.

## Features

- User authentication (login/register)
- Interactive calendar with activity visualization
- Activity creation and management
- Today's activities overview
- Cross-platform (iOS and Android)
- TypeScript for type safety
- Context-based state management

## Quick Start

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Install Expo CLI** (if not already installed):
   ```bash
   npm install -g @expo/cli
   ```

3. **Start Development Server**:
   ```bash
   npm start
   ```

4. **Run on Device/Simulator**:
   - Install Expo Go app on your mobile device
   - Scan the QR code from the terminal
   - Or use iOS Simulator / Android Emulator

## Available Scripts

- `npm start` - Start Expo development server
- `npm run android` - Start on Android emulator
- `npm run ios` - Start on iOS simulator
- `npm run web` - Start web version

## Project Structure

```
src/
├── components/       # Reusable UI components
│   └── LoadingScreen.tsx
├── context/         # React contexts
│   └── AuthContext.tsx
├── navigation/      # Navigation configuration
│   └── AppNavigator.tsx
├── screens/        # Application screens
│   ├── LoginScreen.tsx
│   ├── RegisterScreen.tsx
│   ├── HomeScreen.tsx
│   ├── CalendarScreen.tsx
│   └── AddActivityScreen.tsx
├── services/       # API services
│   └── api.ts
├── types/         # TypeScript definitions
│   └── index.ts
└── utils/         # Utility functions
```

## Key Technologies

- **React Native** - Mobile framework
- **Expo** - Development platform
- **TypeScript** - Type safety
- **React Navigation** - Navigation
- **React Native Calendars** - Calendar component
- **AsyncStorage** - Local storage
- **Axios** - HTTP client

## API Configuration

The app connects to the FastAPI backend running on `http://localhost:8000`. To change the API URL, update the `BASE_URL` constant in `src/services/api.ts`.

## Build for Production

### iOS
```bash
expo build:ios
```

### Android
```bash
expo build:android
```

## Dependencies

Core dependencies are automatically managed by Expo. Additional packages include:

- `@react-navigation/native` - Navigation
- `@react-navigation/stack` - Stack navigation
- `@react-navigation/bottom-tabs` - Tab navigation
- `@react-native-async-storage/async-storage` - Local storage
- `axios` - HTTP client
- `react-native-calendars` - Calendar component
- `@expo/vector-icons` - Icon library