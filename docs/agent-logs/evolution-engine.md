# Evolution Engine Report — 2026-03-22 01:39

Total issues: 92
High: 0 | Medium: 59 | Low: 33

## ACCESSIBILITY (39 issues)
- [MEDIUM] `mobile/src/screens/FoodSearchScreen.tsx` — 2 TouchableOpacity without accessibilityLabel
- [MEDIUM] `mobile/src/screens/NutritionProfileScreen.tsx` — 4 TouchableOpacity without accessibilityLabel
- [MEDIUM] `mobile/src/screens/AddActivityScreen.tsx` — 4 TouchableOpacity without accessibilityLabel
- [MEDIUM] `mobile/src/screens/CalendarScreen.tsx` — 3 TouchableOpacity without accessibilityLabel
- [MEDIUM] `mobile/src/screens/MealLogScreen.tsx` — 4 TouchableOpacity without accessibilityLabel
- [MEDIUM] `mobile/src/screens/OnboardingScreen.tsx` — 8 TouchableOpacity without accessibilityLabel
- [MEDIUM] `mobile/src/screens/NutritionDashboardScreen.tsx` — 3 TouchableOpacity without accessibilityLabel
- [MEDIUM] `mobile/src/screens/RegisterScreen.tsx` — 3 TouchableOpacity without accessibilityLabel
- [MEDIUM] `mobile/src/screens/HomeScreen.tsx` — 7 TouchableOpacity without accessibilityLabel
- [MEDIUM] `mobile/src/screens/LoginScreen.tsx` — 4 TouchableOpacity without accessibilityLabel
  ... and 29 more

## CODE_QUALITY (8 issues)
- [LOW] `mobile/src/components/ErrorBoundary.tsx` — TODO found: // TODO (production): replace with Sentry.captureException(error, { extra: error
- [LOW] `mobile/src/screens/main/AchievementsScreen.tsx` — TODO found: // TODO: Replace with real API call or context value
- [LOW] `backend/app/routers/ai_food.py` — TODO: # TODO:SECURITY [Low] Rate limiting is currently IP-based (get_remote_address).
- [LOW] `backend/app/core/config.py` — TODO: # TODO:SECURITY [Medium] Default DB URL contains dummy credentials. In productio
- [LOW] `backend/app/core/background_tasks.py` — TODO: # TODO: Integrate with FCM/APNs
- [LOW] `backend/app/core/security.py` — TODO: # TODO:SECURITY [Medium] Consider migrating to argon2 or bcrypt for stronger res
- [LOW] `backend/app/core/security.py` — TODO: # TODO:SECURITY [Low] Consider adding special character requirement or
- [LOW] `backend/app/services/oauth_service.py` — TODO: TODO:SECURITY [Medium] Replace tokeninfo endpoint with google-auth library's

## PERFORMANCE (36 issues)
- [LOW] `mobile/src/context/OnboardingContext.tsx` — Large component (281 lines) without React.memo
- [LOW] `mobile/src/context/AuthContext.tsx` — Large component (292 lines) without React.memo
- [LOW] `mobile/src/navigation/MainNavigator.tsx` — Large component (292 lines) without React.memo
- [MEDIUM] `mobile/src/screens/NutritionProfileScreen.tsx` — 4 inline arrow functions in JSX — consider useCallback
- [MEDIUM] `mobile/src/screens/OnboardingScreen.tsx` — 10 inline arrow functions in JSX — consider useCallback
- [MEDIUM] `mobile/src/screens/HomeScreen.tsx` — 5 inline arrow functions in JSX — consider useCallback
- [LOW] `mobile/src/components/SuccessCheckmark.tsx` — Large component (242 lines) without React.memo
- [LOW] `mobile/src/components/FitsiMascot.tsx` — Large component (473 lines) without React.memo
- [LOW] `mobile/src/components/WaterTracker.tsx` — Large component (202 lines) without React.memo
- [LOW] `mobile/src/components/InAppNotification.tsx` — Large component (211 lines) without React.memo
  ... and 26 more

## TESTING (9 issues)
- [MEDIUM] `backend/app/services/ai_scan_service.py` — No test file found for ai_scan_service.py
- [MEDIUM] `backend/app/services/notification_service.py` — No test file found for notification_service.py
- [MEDIUM] `backend/app/services/streak_service.py` — No test file found for streak_service.py
- [MEDIUM] `backend/app/services/oauth_service.py` — No test file found for oauth_service.py
- [MEDIUM] `backend/app/services/workout_service.py` — No test file found for workout_service.py
- [MEDIUM] `backend/app/services/user_service.py` — No test file found for user_service.py
- [MEDIUM] `backend/app/services/insights_service.py` — No test file found for insights_service.py
- [MEDIUM] `backend/app/services/activity_service.py` — No test file found for activity_service.py
- [MEDIUM] `backend/app/services/food_service.py` — No test file found for food_service.py
