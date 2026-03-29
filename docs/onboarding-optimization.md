# Fitsi AI — Onboarding Optimization Analysis

> Version: 1.0 | Last updated: 2026-03-22
> Cross-references: ab-testing-plan.md (EXP-002), analytics-events.md (onboarding events), retention-strategy.md
> Onboarding flow: 30 steps from first launch to paywall

---

## Onboarding Philosophy

The 30-step onboarding serves three purposes simultaneously:

1. **Data collection** — Gather the inputs needed to calculate a personalized nutrition plan (gender, height, weight, age, goal, activity level, diet type)
2. **Sunk cost accumulation** — Each step the user completes increases their psychological investment, making it harder to abandon and more likely to convert at the paywall
3. **Value demonstration** — Social proof, progress charts, and plan building screens show what the app can do before asking for money

The balance between these three purposes determines whether a user completes onboarding or drops off. Too much data collection = fatigue. Too much persuasion = skepticism. Too little personalization = generic plan that doesn't convert.

---

## Step-by-Step Analysis

### Step 01: Splash Screen

| Field | Detail |
|-------|--------|
| **Type** | Impression / Brand |
| **Psychological Purpose** | First impression. Establish brand identity, app category recognition, and visual quality. The splash screen signals "this is a premium, trustworthy product" within 1-2 seconds. Sets the emotional tone for the entire onboarding. |
| **User Action** | None (auto-advances) or tap to continue |
| **Data Collected** | None |
| **Expected Drop-off** | 2-3% (users who opened by accident or immediately switch away) |
| **Sunk Cost Accumulated** | 0% — no investment yet |
| **Optimizations** | (1) Load time must be <1 second — any delay here loses users who haven't committed. (2) Fitsi mascot animation creates emotional hook. (3) Do NOT show a loading spinner — it signals "slow app." (4) If the app was opened from a deep link (referral, push), skip directly to Step 02. |
| **A/B Test Ideas** | Test mascot animation vs. static logo. Test dark background vs. light. Metric: Step 01 → Step 02 transition rate. |

---

### Step 02: Welcome Screen

| Field | Detail |
|-------|--------|
| **Type** | Persuasion / Value Prop |
| **Psychological Purpose** | Frame the user's problem ("counting calories is hard") and present the solution ("AI does it for you in seconds"). This is the hook — if the value prop doesn't resonate in 3 seconds, the user leaves. Create desire to continue by implying personalization ("let's build YOUR plan"). |
| **User Action** | Tap "Continue" / "Get Started" |
| **Data Collected** | None |
| **Expected Drop-off** | 5-8% (users who don't connect with the value prop or recognize the app isn't for them) |
| **Sunk Cost Accumulated** | 1% — minimal, just a tap |
| **Optimizations** | (1) Hero copy must be benefit-focused, not feature-focused: "Pierde peso sin contar calorias" > "App de escaneo de comida con IA." (2) Show a brief demo GIF/animation of scanning food → instant macros. (3) Single clear CTA — no secondary actions. (4) Social proof snippet: "Unete a X personas que ya estan usando Fitsi." |
| **A/B Test Ideas** | Test headline variants: problem-focused ("Cansado de contar calorias?") vs solution-focused ("La IA cuenta por ti") vs outcome-focused ("Pierde peso en piloto automatico"). Metric: Step 02 → Step 03 rate. |

---

### Step 03: Gender

| Field | Detail |
|-------|--------|
| **Type** | Data Collection (essential) |
| **Psychological Purpose** | First personal question. Gender affects BMR calculation, so it's essential for plan accuracy. Placing it first establishes the pattern: "this app is going to personalize things for ME." Easy question = low cognitive load = builds momentum. The user thinks "this is quick and easy." |
| **User Action** | Select gender (male / female / other) |
| **Data Collected** | `gender` — used for BMR (Mifflin-St Jeor) calculation |
| **Expected Drop-off** | 2-3% |
| **Sunk Cost Accumulated** | 5% — first personal data point shared |
| **Optimizations** | (1) Include "Prefer not to say" / "Other" option with neutral BMR calculation. (2) Visual option cards (not a dropdown) — tappable, immediate. (3) No explanation needed — everyone understands this question. (4) Progress bar should show visible movement (3/30 = 10% if normalized). |
| **A/B Test Ideas** | Test card layout (vertical list vs horizontal). Test including "Non-binary" as explicit option. Metric: completion rate. |

---

### Step 04: Workouts/Week

| Field | Detail |
|-------|--------|
| **Type** | Data Collection (essential) |
| **Psychological Purpose** | Activity level directly affects TDEE calculation. This question also begins identity priming — by asking about workouts, the user starts thinking of themselves as someone who cares about fitness. Even selecting "0-1" is a form of commitment. |
| **User Action** | Select workout frequency (0-1, 2-3, 4-5, 6+) |
| **Data Collected** | `workouts_week` — used for activity multiplier in TDEE |
| **Expected Drop-off** | 1-2% |
| **Sunk Cost Accumulated** | 8% |
| **Optimizations** | (1) Use ranges, not exact numbers — "2-3 times" feels less judgmental than asking for a precise count. (2) Visual icons for each level (couch, walking, running, athlete). (3) Brief explainer: "This helps us calculate your daily calorie needs." |
| **A/B Test Ideas** | Test 4 options vs 5 options (add "1-2" between sedentary and moderate). Metric: correlation between selection and D7 retention (does accuracy of this step predict retention?). |

---

### Step 05: Source (How Did You Hear About Us?)

| Field | Detail |
|-------|--------|
| **Type** | Data Collection (non-essential) |
| **Psychological Purpose** | Attribution data for marketing — does NOT affect the user's plan. Low cognitive load question that feels conversational. However, it adds a step that provides zero value to the user. This is a "company need" step, not a "user need" step. |
| **User Action** | Select source (TikTok, Instagram, Friend, App Store, etc.) |
| **Data Collected** | `heard_from` — marketing attribution |
| **Expected Drop-off** | 3-4% (users sense this isn't for them) |
| **Sunk Cost Accumulated** | 10% |
| **Optimizations** | (1) CANDIDATE FOR REMOVAL in 20-step variant (EXP-002). Can be collected post-onboarding via in-app survey at Day 3. (2) If kept, make it optional with a "Skip" link. (3) Limit to 5-6 options — too many choices cause decision fatigue. |
| **A/B Test Ideas** | Test removing this step entirely. Metric: onboarding completion rate (upstream impact). |

---

### Step 06: Used Other Apps

| Field | Detail |
|-------|--------|
| **Type** | Data Collection (non-essential) |
| **Psychological Purpose** | Competitive intelligence. Also subtly suggests "this app is different from what you've tried before." If user selects MyFitnessPal, the later comparison chart (Step14) can reference it. But the actual plan doesn't change based on this answer. |
| **User Action** | Select apps used (MyFitnessPal, Lose It, Cal AI, None, etc.) |
| **Data Collected** | `used_other_apps` — competitive intel |
| **Expected Drop-off** | 3-4% |
| **Sunk Cost Accumulated** | 12% |
| **Optimizations** | (1) CANDIDATE FOR REMOVAL in 20-step variant. (2) If kept, position as "We'll make sure Fitsi works better for you" — give the user a reason to answer. (3) "None" should be the most prominent option (most users haven't used competitors). |
| **A/B Test Ideas** | Remove and measure if onboarding completion improves. |

---

### Step 07: Social Proof Chart

| Field | Detail |
|-------|--------|
| **Type** | Persuasion |
| **Psychological Purpose** | Show that "people like you" have succeeded. The animated chart showing user progress creates aspiration and reduces fear of failure. Positioned after 4 data questions — the user deserves a "reward" break from answering. Social proof at this point re-energizes motivation to continue. |
| **User Action** | View chart → tap Continue |
| **Data Collected** | None |
| **Expected Drop-off** | 4-5% (highest persuasion-screen drop-off — users who feel manipulated) |
| **Sunk Cost Accumulated** | 14% |
| **Optimizations** | (1) CANDIDATE FOR REMOVAL or CONSOLIDATION in 20-step variant. (2) If kept, the chart must feel data-driven, not fake. Use "Based on 10,000+ users" with realistic curves. (3) Personalize: "Users with your activity level see results in X weeks." (4) Animation timing: chart should build over 2-3 seconds — too fast feels cheap, too slow feels slow. |
| **A/B Test Ideas** | Test animated chart vs. static chart vs. text-only social proof ("92% of users who log for 7 days see results"). Metric: Step 07 → Step 08 rate + downstream D7 retention (does this screen prime commitment?). |

---

### Step 08: Height & Weight

| Field | Detail |
|-------|--------|
| **Type** | Data Collection (essential) |
| **Psychological Purpose** | Critical for BMR calculation. This is the highest-friction data collection step — users are sharing sensitive body measurements. The experience of inputting weight can trigger self-consciousness. The UX must feel safe, non-judgmental, and easy. Offering metric/imperial toggle respects user preference. |
| **User Action** | Input height (cm or ft/in) and current weight (kg or lbs) |
| **Data Collected** | `height_cm`, `weight_kg`, `unit_system` |
| **Expected Drop-off** | 5-7% (sensitive data + input friction) |
| **Sunk Cost Accumulated** | 20% — significant personal data shared |
| **Optimizations** | (1) Use sliders or scroll pickers, NOT text input — eliminates keyboard friction. (2) Default to reasonable values based on gender (170cm male, 160cm female). (3) Unit toggle must be prominent — wrong units = wrong plan. (4) "Your data is encrypted and never shared" micro-copy below the input. (5) Do NOT show BMI or any judgment — just collect the numbers. |
| **A/B Test Ideas** | Test slider vs scroll picker vs text input. Test showing "Your data is private" trust badge vs not. Metric: Step 08 completion rate + time on step. |

---

### Step 09: Birthday

| Field | Detail |
|-------|--------|
| **Type** | Data Collection (essential) |
| **Psychological Purpose** | Age affects BMR calculation. Birthday feels more personal than "enter your age" and enables birthday notifications later. Date picker is familiar UX. Lower friction than height/weight because there's no sensitivity — everyone has a birthday. |
| **User Action** | Select birthday (date picker) |
| **Data Collected** | `birth_date` — used to calculate age for BMR |
| **Expected Drop-off** | 2-3% |
| **Sunk Cost Accumulated** | 24% |
| **Optimizations** | (1) Use a scroll date picker (iOS-style), NOT a calendar grid — too many taps for birthdays. (2) Default to a reasonable year (e.g., 25 years ago from today). (3) Auto-advance after selection if possible. (4) Validate age 13+ (legal requirement) and 13-90 range. |
| **A/B Test Ideas** | Test "Birthday" label vs "Age" label (age is faster to answer but less useful for future engagement). |

---

### Step 10: Goal

| Field | Detail |
|-------|--------|
| **Type** | Data Collection (essential) + Identity |
| **Psychological Purpose** | THE MOST IMPORTANT QUESTION. Selecting "Lose weight" / "Maintain" / "Gain muscle" is an identity commitment. The user is telling the app (and themselves) what they want to achieve. This is the moment where the app transitions from "data collection tool" to "personal partner." Everything after this step feels increasingly tailored. |
| **User Action** | Select primary goal |
| **Data Collected** | `goal` — determines calorie deficit/surplus calculation |
| **Expected Drop-off** | 2-3% |
| **Sunk Cost Accumulated** | 30% — major psychological investment (identity commitment) |
| **Optimizations** | (1) Maximum 3 options: Lose Weight, Maintain, Gain Muscle. No "other" — force a choice. (2) Emoji or icon for each option (scale down, balance, muscle). (3) Goal selection should trigger a micro-animation/haptic feedback. (4) After selecting, show a personalized encouragement: "Great choice! We'll build your plan around losing weight." |
| **A/B Test Ideas** | Test 3 options vs 5 options (add "Eat healthier" and "Track nutrition"). Metric: downstream trial start rate by goal type. |

---

### Step 11: Target Weight

| Field | Detail |
|-------|--------|
| **Type** | Data Collection (essential for lose/gain) |
| **Psychological Purpose** | Concrete goal setting. A number makes the abstract ("lose weight") specific ("reach 75kg"). The ruler/slider interaction is tactile and engaging. Seeing a specific target weight creates commitment and enables progress tracking later. Also provides the key input for the "estimated time to goal" calculation. |
| **User Action** | Select target weight using ruler/slider |
| **Data Collected** | `target_weight_kg` |
| **Expected Drop-off** | 3-4% (some users don't have a specific number in mind and feel stuck) |
| **Sunk Cost Accumulated** | 34% |
| **Optimizations** | (1) Show a suggested range: "For your height, a healthy weight is X-Y kg." (2) Include a "Not sure" option that defaults to -5kg for lose, +3kg for gain. (3) Ruler should be smooth and responsive — laggy interaction kills momentum. (4) Show "You'll reach this in ~X weeks" preview text (calculated from speed selection in Step 13). |
| **A/B Test Ideas** | Test ruler slider vs simple number input vs pre-set options (-5kg, -10kg, -15kg). Metric: completion rate + correlation with D30 retention (do users with specific targets retain better?). |

---

### Step 12: Affirmation

| Field | Detail |
|-------|--------|
| **Type** | Persuasion / Motivation |
| **Psychological Purpose** | Emotional reward after the heaviest data-collection block (Steps 3-11). The affirmation validates the user's decision and reduces the psychological weight of sharing personal data. It's a "breathing room" step that prevents fatigue. Common pattern in health app onboarding (Noom, Headspace). |
| **User Action** | View affirmation → tap Continue |
| **Data Collected** | None |
| **Expected Drop-off** | 3-4% (feels like filler to skeptical users) |
| **Sunk Cost Accumulated** | 36% |
| **Optimizations** | (1) CANDIDATE FOR REMOVAL in 20-step variant — can be merged into Step 10 (Goal) as inline encouragement. (2) If kept, personalize based on goal: "You want to lose {{target_delta}}kg? Totally achievable. Let's build your plan." (3) Keep it to 2-3 sentences — not a paragraph. (4) Fitsi mascot with encouraging expression. |
| **A/B Test Ideas** | Test with vs without this screen. Metric: onboarding completion rate + Step 13 engagement (does the break improve or hurt momentum?). |

---

### Step 13: Speed Slider

| Field | Detail |
|-------|--------|
| **Type** | Data Collection (essential) |
| **Psychological Purpose** | Gives the user control over their journey pace. The slider (slow/moderate/fast) sets expectations and directly affects the calorie deficit/surplus calculation. This step creates a sense of agency — "I'm in control of how fast I get there." It also prevents the common objection "this is too aggressive / too slow for me." |
| **User Action** | Adjust speed slider (0.25kg/week to 1kg/week) |
| **Data Collected** | `weight_speed_kg` — weekly target loss/gain rate |
| **Expected Drop-off** | 2-3% |
| **Sunk Cost Accumulated** | 39% |
| **Optimizations** | (1) Show real-time preview: "At this pace, you'll reach {{target_weight}}kg by {{date}}." (2) Recommended setting should be highlighted (0.5kg/week for most people). (3) Warning for aggressive settings: "Losing more than 1kg/week is not recommended by health organizations." (4) Smooth slider with haptic ticks. |
| **A/B Test Ideas** | Test slider vs 3 pre-set options ("Gentle / Moderate / Aggressive"). Metric: completion rate + plan adherence at D14 (do users who pick realistic speeds retain better?). |

---

### Step 14: 2X Comparison Chart

| Field | Detail |
|-------|--------|
| **Type** | Persuasion |
| **Psychological Purpose** | "Fitsi users lose weight 2X faster than doing it alone" — this comparison creates urgency and FOMO. Positioned after the user has set their goal and speed, it validates their choice: "you picked the right tool." The chart format makes it feel data-driven rather than marketing copy. |
| **User Action** | View chart → tap Continue |
| **Data Collected** | None |
| **Expected Drop-off** | 4-5% |
| **Sunk Cost Accumulated** | 41% |
| **Optimizations** | (1) CANDIDATE FOR REMOVAL or RELOCATION in 20-step variant — this persuasion content can move to the paywall screen where conversion intent is highest. (2) If kept, the claim must be defensible — cite the source or frame as "based on user data." (3) Animation: show the "without app" line first, then the "with Fitsi" line overtaking it. (4) Personalize with user's goal: "Users with your goal lose 2X faster with Fitsi." |
| **A/B Test Ideas** | Test removing this step and adding the chart to the paywall. Metric: trial start rate (does moving this to paywall increase conversion?). |

---

### Step 15: Pain Points

| Field | Detail |
|-------|--------|
| **Type** | Data Collection (semi-essential) + Empathy |
| **Psychological Purpose** | Asking "what's been hard?" validates the user's struggles and shows the app understands their experience. Multi-select allows expression of multiple frustrations. This data can personalize the app experience (e.g., if "portion control" is selected, show portion tips). More importantly, it creates a "you understand me" feeling that builds trust. |
| **User Action** | Multi-select pain points (portion control, late-night eating, emotional eating, etc.) |
| **Data Collected** | `pain_points` (TEXT[]) — used for personalization and content targeting |
| **Expected Drop-off** | 2-3% |
| **Sunk Cost Accumulated** | 44% |
| **Optimizations** | (1) Keep to 6-8 options max. (2) "None of the above" must be an option. (3) Multi-select chips are best — tappable, visual, fast. (4) Micro-copy: "We'll help you tackle these." (5) Data should actually be used downstream (coach suggestions, weekly tips). |
| **A/B Test Ideas** | Test multi-select vs single-select ("What's your biggest challenge?"). Metric: completion rate + data quality (do pain points predict churn?). |

---

### Step 16: Diet Type

| Field | Detail |
|-------|--------|
| **Type** | Data Collection (semi-essential) |
| **Psychological Purpose** | Signals that the app respects dietary preferences and won't recommend foods that conflict with the user's lifestyle. Selecting "Keto" or "Vegetarian" makes the plan feel truly personalized. Even selecting "No restriction" is informative. This step also enables better recipe recommendations (Premium feature). |
| **User Action** | Select diet type (No restriction, Keto, Vegetarian, Vegan, Mediterranean, etc.) |
| **Data Collected** | `diet_type` — used for recipe filtering and AI scanner food suggestions |
| **Expected Drop-off** | 2-3% |
| **Sunk Cost Accumulated** | 47% |
| **Optimizations** | (1) "No restriction" should be the first and most prominent option (majority of users). (2) Max 6-7 options — don't overwhelm. (3) Brief description under each: "Keto — low carb, high fat." (4) If user selects a specific diet, acknowledge it: "Great, we'll keep your recipes {{diet_type}}-friendly." |
| **A/B Test Ideas** | Test including "Intermittent Fasting" as an option. Metric: recipe engagement rate by diet type. |

---

### Step 17: Accomplishments

| Field | Detail |
|-------|--------|
| **Type** | Data Collection (non-essential) + Empathy |
| **Psychological Purpose** | "What have you already tried/accomplished?" focuses on positives rather than failures. This creates a growth mindset: the user isn't starting from zero, they're building on past effort. Options like "Lost weight before" or "Exercised regularly" are identity reinforcements. This data can drive personalized coach messages. |
| **User Action** | Multi-select accomplishments |
| **Data Collected** | `accomplishments` (TEXT[]) |
| **Expected Drop-off** | 3-4% |
| **Sunk Cost Accumulated** | 50% — HALFWAY POINT |
| **Optimizations** | (1) Frame positively — "What have you achieved?" not "What have you tried and failed at?" (2) Include options that everyone can relate to: "Decided to make a change" (low bar, anyone can select it). (3) This is the 50% mark of onboarding — consider showing a micro-celebration ("Halfway there! Your plan is coming together."). |
| **A/B Test Ideas** | Test removing this step. Metric: does it affect downstream retention? (Hypothesis: the emotional framing helps but the data has limited use.) |

---

### Step 18: Progress Chart

| Field | Detail |
|-------|--------|
| **Type** | Persuasion |
| **Psychological Purpose** | Personalized projection chart: "Based on your data, here's your expected progress." Shows a curve from current weight to target weight with the estimated timeline. This is the first tangible "payoff" from all the data the user entered — they see their inputs transformed into a plan preview. Creates excitement and commitment. |
| **User Action** | View chart → tap Continue |
| **Data Collected** | None (calculated from inputs) |
| **Expected Drop-off** | 3-4% |
| **Sunk Cost Accumulated** | 53% |
| **Optimizations** | (1) CANDIDATE FOR REMOVAL or CONSOLIDATION with Step 27 (Plan Ready) in 20-step variant — both show personalized data. (2) If kept, the chart must use the user's actual numbers: "{{current_weight}}kg → {{target_weight}}kg by {{date}}." (3) Chart animation: weight line declining over time creates anticipation. (4) Realistic timelines only — if the calculation is >6 months, show "~6 months" not "26 weeks." |
| **A/B Test Ideas** | Test showing this chart here vs only on Plan Ready (Step 27). Metric: Does seeing progress twice (here + Step 27) improve paywall conversion, or does it feel redundant? |

---

### Step 19: Trust / Privacy

| Field | Detail |
|-------|--------|
| **Type** | Persuasion / Objection Handling |
| **Psychological Purpose** | Proactively address the #1 concern with health apps: "is my data safe?" Trust badges, encryption mentions, and privacy commitments reduce anxiety before the user shares their most sensitive data (account creation is 6 steps away). Positioned after the progress chart (high emotion) and before the permission requests. |
| **User Action** | View trust information → tap Continue |
| **Data Collected** | None |
| **Expected Drop-off** | 3-4% |
| **Sunk Cost Accumulated** | 55% |
| **Optimizations** | (1) CANDIDATE FOR REMOVAL in 20-step variant — can be replaced with a trust badge on the account creation screen. (2) If kept, keep it to 3 bullet points: encrypted, never sold, deletable. (3) Link to privacy policy (required for App Store). (4) Do NOT make this feel like a legal disclaimer — keep it friendly. |
| **A/B Test Ideas** | Test removing this step and adding a lock icon + "Your data is private" line to Step 25 (Account Creation). |

---

### Step 20: Health Connect

| Field | Detail |
|-------|--------|
| **Type** | Permission / Feature Activation |
| **Psychological Purpose** | Connecting Apple Health or Google Fit creates deeper integration, richer data, and platform lock-in. Users who connect health apps retain significantly better because: (1) more data flows in automatically, (2) switching costs increase, (3) the app feels like part of their health ecosystem. Position before notifications because health connect is higher value. |
| **User Action** | Grant or decline Health app permission |
| **Data Collected** | `health_connected` (boolean) |
| **Expected Drop-off** | 5-6% (permission requests always cause drop-off) |
| **Sunk Cost Accumulated** | 58% |
| **Optimizations** | (1) Show clear value: "Connect Apple Health to automatically sync your steps, weight, and workouts." (2) "Maybe later" option (not just "No") — reduces perceived pressure. (3) Pre-permission screen before the system dialog explains WHY. (4) If declined, do NOT ask again during onboarding. Offer again at Day 7 in settings. |
| **A/B Test Ideas** | Test "Connect now" vs "Maybe later" as the decline copy. Test moving this to post-onboarding (Day 3). Metric: Health connect rate + D14 retention by connected vs not. |

---

### Step 21: Reviews / Social Proof

| Field | Detail |
|-------|--------|
| **Type** | Persuasion |
| **Psychological Purpose** | User testimonials and ratings create peer validation. "People like me succeeded" is more convincing than feature lists. Positioned after the permission request (which can feel intrusive) as a confidence booster. Testimonials should be relatable to the user's goal (show weight-loss stories to users who selected "lose weight"). |
| **User Action** | View reviews → tap Continue |
| **Data Collected** | None |
| **Expected Drop-off** | 3-4% |
| **Sunk Cost Accumulated** | 61% |
| **Optimizations** | (1) CANDIDATE FOR REMOVAL in 20-step variant — consolidate social proof to paywall. (2) If kept, 2-3 testimonials MAX. Each with: name, result, timeframe. (3) Personalize by goal: show weight-loss testimonials to "lose" users, muscle-gain to "gain" users. (4) Star rating display: "4.6 stars from 5,000+ reviews." |
| **A/B Test Ideas** | Move testimonials to paywall (Step 28) and measure if paywall conversion improves. |

---

### Step 22: Flexibility Highlight

| Field | Detail |
|-------|--------|
| **Type** | Persuasion / Objection Handling |
| **Psychological Purpose** | Addresses the objection: "Will this be too strict? Will I have to give up foods I love?" The flexibility screen reassures: "You can eat anything — just track it." This is critical for users who've failed rigid diets before. Reduces pre-commitment anxiety about starting a new program. |
| **User Action** | View flexibility message → tap Continue |
| **Data Collected** | None |
| **Expected Drop-off** | 3-4% |
| **Sunk Cost Accumulated** | 63% |
| **Optimizations** | (1) CANDIDATE FOR REMOVAL in 20-step variant — this message can be integrated into Step 27 (Plan Ready) as a subtitle. (2) If kept, use specific examples: "Pizza, tacos, ice cream — you can eat them all. We just help you track." (3) Fitsi mascot with a pizza slice creates levity. |
| **A/B Test Ideas** | Remove and add flexibility messaging to Plan Ready screen. |

---

### Step 23: Notifications

| Field | Detail |
|-------|--------|
| **Type** | Permission / Feature Activation |
| **Psychological Purpose** | Push notification permission is CRITICAL for retention. Users with push enabled retain 2-3x better. Positioning after the user has invested 23 steps of data and seen their personalized preview maximizes the grant rate. The pre-permission screen should frame notifications as "meal reminders" (utility) not "marketing messages." |
| **User Action** | Grant or decline push notification permission |
| **Data Collected** | `notifications_enabled` (boolean) |
| **Expected Drop-off** | 4-5% (second permission request in onboarding) |
| **Sunk Cost Accumulated** | 67% |
| **Optimizations** | (1) Pre-permission screen BEFORE the iOS system dialog: "Get reminders for breakfast, lunch, and dinner so you never forget to log." (2) Show examples of notifications they'll receive (visual mock). (3) "You can change this anytime in settings" reduces commitment anxiety. (4) If declined: retry prompt after user hits scan limit on Day 2 (high-engagement moment). (5) NEVER ask more than twice. |
| **A/B Test Ideas** | Test pre-permission copy: "Meal reminders" vs "Progress updates" vs "Don't miss your streak." Metric: iOS notification permission grant rate. |

---

### Step 24: Referral Code

| Field | Detail |
|-------|--------|
| **Type** | Data Collection (non-essential) + Growth |
| **Psychological Purpose** | Viral loop input. Users who were referred by a friend enter the code here. This step also plants the seed: "referrals exist" — even users without a code see the concept and may refer others later. However, 90%+ of users won't have a code, making this step feel useless for most. |
| **User Action** | Enter referral code or skip |
| **Data Collected** | `referral_code` — links to referral system |
| **Expected Drop-off** | 3-4% (feels irrelevant to non-referred users) |
| **Sunk Cost Accumulated** | 70% |
| **Optimizations** | (1) CANDIDATE FOR REMOVAL in 20-step variant — referral code can be entered in Settings post-onboarding. (2) If kept, "Skip" must be the prominent action — don't make non-referred users feel they're missing out. (3) Auto-detect referral codes from deep links (no manual entry needed). (4) Show reward: "Enter a code and get 3 extra AI scans today." |
| **A/B Test Ideas** | Remove from onboarding, add to Settings + Day 3 in-app prompt. Metric: referral code entry rate + onboarding completion impact. |

---

### Step 25: Account Creation

| Field | Detail |
|-------|--------|
| **Type** | Data Collection (essential) + Commitment |
| **Psychological Purpose** | The HIGHEST-FRICTION step. Creating an account requires email/password or OAuth. This is where the user transitions from anonymous to identified — a major psychological commitment. All data entered so far is now tied to a real identity. Users who create accounts have 5x higher D30 retention than those who don't. Position after maximum sunk cost accumulation (70%). |
| **User Action** | Sign up via email, Apple, or Google |
| **Data Collected** | Account credentials |
| **Expected Drop-off** | 8-12% (highest drop-off step in the entire onboarding) |
| **Sunk Cost Accumulated** | 80% — massive commitment |
| **Optimizations** | (1) Apple Sign In and Google Sign In should be the TOP options (one-tap, no typing). (2) Email should be the fallback, not the primary. (3) Show "Your personalized plan is almost ready — we need an account to save it." (4) If user backs out, show "Your data will be lost if you leave without an account." (5) Terms of service + privacy policy links required but not intrusive. |
| **A/B Test Ideas** | Test Apple/Google first vs email first. Test requiring account at Step 10 (earlier) vs Step 25 (current). Metric: account creation rate + onboarding completion rate. |

---

### Step 26: Plan Building (Loading)

| Field | Detail |
|-------|--------|
| **Type** | Experience / Perceived Value |
| **Psychological Purpose** | Artificial loading screen that "builds" the personalized plan. The deliberate delay (8-15 seconds) creates perceived value: "the AI is working hard on MY plan." Without this step, the instant transition from account creation to plan feels cheap — as if no real computation happened. The loading animation with progress steps ("Analyzing your data... Calculating macros... Building your plan...") justifies the personalization. |
| **User Action** | Watch loading animation → auto-advance |
| **Data Collected** | None (calculation happens server-side) |
| **Expected Drop-off** | 1-2% (user has already created account — they're committed) |
| **Sunk Cost Accumulated** | 85% |
| **Optimizations** | (1) Loading steps should reference the user's inputs: "Calculating macros for {{goal}}..." (2) 3-4 progress steps, each 3-4 seconds. (3) Fitsi mascot with "thinking" expression. (4) If actual API call is fast, add artificial delay to 8 seconds minimum. (5) Never let this screen take >15 seconds — add timeout fallback. |
| **A/B Test Ideas** | Test 8-second vs 15-second loading duration. Metric: perceived plan value (measure by trial start rate at Step 28). |

---

### Step 27: Plan Ready

| Field | Detail |
|-------|--------|
| **Type** | Value Revelation / Pre-Paywall Priming |
| **Psychological Purpose** | THE PAYOFF. The user sees their personalized plan: daily calories, protein, carbs, fat targets. This is the culmination of 26 steps of input. The plan must feel valuable, specific, and actionable. This is also the prime moment for paywall priming — the user has their plan and wants to USE it. Next step is the paywall. |
| **User Action** | View plan details → tap Continue |
| **Data Collected** | None (displays calculated values) |
| **Expected Drop-off** | 1-2% (users are all-in at this point) |
| **Sunk Cost Accumulated** | 90% |
| **Optimizations** | (1) Show the exact numbers prominently: "{{daily_calories}} kcal, {{protein}}g protein, {{carbs}}g carbs, {{fats}}g fat." (2) Personalized summary: "To {{goal}} and reach {{target_weight}}kg by {{date}}, here's your daily plan." (3) Health score display (0-100). (4) Fitsi mascot celebrating. (5) CTA: "Start your journey" — primes for paywall. |
| **A/B Test Ideas** | Test plan with estimated goal date vs without. Test showing health score vs not. Metric: paywall trial start rate (does seeing the date create more urgency?). |

---

### Step 28: Paywall (Primary)

| Field | Detail |
|-------|--------|
| **Type** | Monetization (Primary) |
| **Psychological Purpose** | The user has invested 27 steps. They have a personalized plan. They want to start using it. This is the highest-conversion paywall moment because: (1) sunk cost is at 90%, (2) the plan is tangible, (3) the desire to ACT is highest. Show the paywall with clear Free vs Premium comparison. The 7-day free trial reduces the commitment barrier — "try before you buy." |
| **User Action** | Start trial, select plan, or dismiss |
| **Data Collected** | Subscription event via RevenueCat |
| **Expected Drop-off** | N/A (this is the conversion step, not a completion step) |
| **Sunk Cost Accumulated** | 93% |
| **Optimizations** | (1) Feature comparison: Free (3 scans/day, basic dashboard) vs Premium (unlimited, recipes, insights, etc.). (2) Annual plan highlighted as "Most Popular" with savings badge. (3) CTA: "Start 7-Day Free Trial" — green, prominent, full-width. (4) "Restore purchase" link for returning users. (5) X/Close button visible but not prominent (top-right, small). |
| **A/B Test Ideas** | See EXP-007 (social proof), EXP-008 (paywall timing), EXP-001 (trial length), EXP-003 (pricing) in ab-testing-plan.md. |

---

### Step 29: Spin the Wheel

| Field | Detail |
|-------|--------|
| **Type** | Monetization (Gamified Recovery) |
| **Psychological Purpose** | For users who declined Step 28, the spin-the-wheel applies three psychological principles: (1) variable reward — the random discount creates dopamine anticipation, (2) loss aversion — "I won a discount, I'd be wasting it if I don't use it," (3) gamification — the spinning animation is inherently engaging. Users who declined a flat price are more likely to buy when they feel they "won" a deal. |
| **User Action** | Spin the wheel → see discount → decide |
| **Data Collected** | Discount percentage applied |
| **Expected Drop-off** | N/A (secondary conversion attempt) |
| **Sunk Cost Accumulated** | 95% |
| **Optimizations** | (1) Wheel should feel genuinely random (animation speed, overshoots). (2) Confetti animation on result. (3) Timer: "This offer expires in 10:00" — artificial scarcity. (4) "No thanks, continue with free" must be accessible (ethical requirement). (5) Sound effects enhance the experience. |
| **A/B Test Ideas** | See EXP-010 (discount depth) in ab-testing-plan.md. |

---

### Step 30: Paywall Discount

| Field | Detail |
|-------|--------|
| **Type** | Monetization (Discounted Offer) |
| **Psychological Purpose** | Shows the paywall again with the "won" discount applied. The user sees crossed-out original prices with new discounted prices. The visual contrast (strikethrough + new price) creates a strong value perception. This is the final conversion attempt before the user enters the free tier. |
| **User Action** | Start discounted trial or dismiss |
| **Data Collected** | Subscription event with discount via RevenueCat |
| **Expected Drop-off** | N/A (final conversion step) |
| **Sunk Cost Accumulated** | 97% |
| **Optimizations** | (1) Show original price crossed out + new price prominently. (2) "You saved X%!" celebration message. (3) Same CTA as Step 28 but with discount applied. (4) Countdown timer continues from Step 29. (5) If user still declines, enter free tier gracefully — do NOT make them feel bad. |
| **A/B Test Ideas** | Test countdown timer (10 min) vs no timer. Test "Use my discount" vs "Start Free Trial (30% off)." |

---

## Sunk Cost Accumulation Map

```
Step  Investment   Cumulative  Type
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 01   ░░           0%          Brand impression
 02   ░░           1%          Value prop buy-in
 03   ██           5%          First personal data (gender)
 04   ██           8%          Activity level
 05   ░░           10%         Attribution (low value)
 06   ░░           12%         Competitor info (low value)
 07   ░░           14%         Viewed social proof
 08   ████         20%         HEIGHT + WEIGHT (sensitive!)
 09   ██           24%         Birthday
 10   ████         30%         GOAL COMMITMENT (identity!)
 11   ███          34%         Target weight
 12   ░░           36%         Viewed affirmation
 13   ██           39%         Speed preference
 14   ░░           41%         Viewed comparison
 15   ██           44%         Pain points shared
 16   ██           47%         Diet preference
 17   ██           50%         Accomplishments shared ← HALFWAY
 18   ░░           53%         Viewed progress chart
 19   ░░           55%         Viewed trust info
 20   ███          58%         Health app permission
 21   ░░           61%         Viewed reviews
 22   ░░           63%         Viewed flexibility
 23   ███          67%         Notification permission
 24   ░░           70%         Referral code
 25   ██████       80%         ACCOUNT CREATED (massive!)
 26   ██           85%         Watched plan build
 27   ██           90%         SAW PERSONALIZED PLAN
 28   ███          93%         Primary paywall
 29   ██           95%         Spin the wheel
 30   ██           97%         Discount paywall

Legend: ░░ = persuasion (no data), ██ = data collection, ███ = permission
```

**Key insight:** The three biggest sunk cost jumps are:
1. **Step 08 (Height/Weight)** — +6pp. First truly sensitive data.
2. **Step 10 (Goal)** — +6pp. Identity commitment.
3. **Step 25 (Account Creation)** — +10pp. Named identity.

If a user passes Step 25, there's <5% chance they'll abandon before reaching the paywall.

---

## Drop-Off Heatmap (Expected)

```
                        Expected    Cumulative
Step                    Drop-off    Surviving
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
01 Splash               2.5%        97.5%
02 Welcome              6.5%        91.2%
03 Gender               2.5%        88.9%
04 Workouts             1.5%        87.6%
05 Source               3.5%        84.5%     ← REMOVE CANDIDATE
06 Other Apps           3.5%        81.5%     ← REMOVE CANDIDATE
07 Social Proof         4.5%        77.9%     ← REMOVE CANDIDATE
08 Height/Weight        6.0%        73.2%     ★ HIGH DROP-OFF
09 Birthday             2.5%        71.4%
10 Goal                 2.5%        69.6%
11 Target Weight        3.5%        67.2%
12 Affirmation          3.5%        64.8%     ← REMOVE CANDIDATE
13 Speed                2.5%        63.2%
14 Comparison           4.5%        60.3%     ← REMOVE CANDIDATE
15 Pain Points          2.5%        58.8%
16 Diet Type            2.5%        57.3%
17 Accomplishments      3.5%        55.3%
18 Progress Chart       3.5%        53.4%     ← REMOVE CANDIDATE
19 Trust                3.5%        51.5%     ← REMOVE CANDIDATE
20 Health Connect       5.5%        48.7%     ★ HIGH DROP-OFF
21 Reviews              3.5%        47.0%     ← REMOVE CANDIDATE
22 Flexibility          3.5%        45.3%     ← REMOVE CANDIDATE
23 Notifications        4.5%        43.3%
24 Referral             3.5%        41.8%     ← REMOVE CANDIDATE
25 Account Creation    10.0%        37.6%     ★★ HIGHEST DROP-OFF
26 Plan Building        1.5%        37.0%
27 Plan Ready           1.5%        36.5%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 36.5% of installs reach Plan Ready (30-step flow)
```

**20-step variant projected:**
Removing 10 steps (05, 06, 07, 12, 14, 18, 19, 21, 22, 24) eliminates ~35pp of cumulative drop-off. Projected survival to Plan Ready: **~52-55%** — a +15-18pp improvement over the 30-step flow.

---

## A/B Testing Recommendations by Step

### Highest-Impact Tests (test first)

| Priority | Step | Test | Expected Impact |
|----------|------|------|----------------|
| 1 | Step 25 | Apple/Google sign-in first vs email first | -3-5pp drop-off |
| 2 | Steps 05-07 | Remove block of 3 non-essential steps | -8-10pp cumulative drop |
| 3 | Step 08 | Slider vs scroll picker for weight | -1-2pp drop-off |
| 4 | Step 20 | Move Health Connect to post-onboarding Day 3 | -3-4pp drop-off |
| 5 | Step 23 | Optimize pre-permission copy for push | +5-10pp grant rate |

### Medium-Impact Tests

| Priority | Step | Test | Expected Impact |
|----------|------|------|----------------|
| 6 | Step 02 | Headline copy variants (problem vs solution vs outcome) | +2-3pp Step 02→03 |
| 7 | Step 10 | 3 goals vs 5 goals | Conversion quality signal |
| 8 | Step 26 | 8-second vs 15-second loading | Paywall conversion delta |
| 9 | Step 28 | Social proof on paywall (see EXP-007) | +1-3pp trial rate |
| 10 | Step 13 | Slider vs preset options for speed | Completion + plan quality |

### Low-Impact / Nice-to-Have

| Priority | Step | Test | Expected Impact |
|----------|------|------|----------------|
| 11 | Step 01 | Mascot animation vs static logo | <1pp impact |
| 12 | Step 09 | Birthday vs Age input | <1pp impact |
| 13 | Step 12 | With affirmation vs without | <1pp completion, possible retention delta |
| 14 | Step 29 | Wheel animation speed variants | <1pp conversion |

---

## Onboarding Recovery Strategies

### For Users Who Abandon Mid-Onboarding

| Abandon Point | Recovery Action | Timing | Channel |
|--------------|----------------|--------|---------|
| Steps 1-7 | None — insufficient investment to re-engage | — | — |
| Steps 8-14 | Email: "Your personalized plan is almost ready — just a few more questions" | +24h | Email (if collected) |
| Steps 15-24 | Push: "You're 80% done! Finish your plan in 2 minutes" | +4h | Push (if granted at Step 23) |
| Step 25 (Account) | Email: "Complete your account to save your {{daily_calories}} kcal plan" | +1h | Email / Push |
| Steps 26-27 | Push: "Your plan is ready! Open the app to see it" | +30min | Push |

### For Users Who Complete But Don't Activate

| Behavior | Recovery Action | Timing |
|----------|----------------|--------|
| Completed onboarding, 0 scans in 24h | Push: "Your plan is ready! Scan your first meal in 10 seconds" | +2h post-completion |
| Completed onboarding, 0 scans in 48h | Email: "Just point your camera at any food — AI does the rest" | +48h |
| Created account but never reached Step 27 | Deep link email to resume at their last step | +24h |

---

## Measurement Framework

### Events to Track (all from analytics-events.md)

| Event | Purpose |
|-------|---------|
| `onboarding_started` | Funnel entry |
| `onboarding_step_viewed` | Step-by-step drop-off |
| `onboarding_step_completed` | Step conversion + data quality |
| `onboarding_step_back` | Confusion/friction signal |
| `onboarding_account_created` | Critical conversion event |
| `onboarding_plan_generated` | Plan quality metrics |
| `onboarding_completed` | Funnel exit |
| `onboarding_abandoned` | Drop-off with last step |

### Dashboard Metrics (daily review)

| Metric | Definition | Target | Alert Threshold |
|--------|-----------|--------|----------------|
| Onboarding start rate | Step 01 views / Installs | >95% | <90% |
| Step-by-step completion | Step N+1 views / Step N views | >92% per step | Any step <88% |
| Account creation rate | Accounts / Step 01 views | >50% | <40% |
| Onboarding completion rate | Step 27 views / Installs | >65% (30-step) / >75% (20-step) | <55% |
| Average completion time | Median minutes Step 01 → 27 | 4-6 min | >8 min |
| Paywall view rate | Step 28 views / Step 27 views | >95% | <90% |
| Onboarding → Trial rate | Trial starts / Step 01 views | >6% | <4% |

### Cohort Analysis Dimensions

Track onboarding metrics segmented by:
- Acquisition channel (organic / paid / referral)
- Platform (iOS / Android)
- Geography (LATAM / US / EU)
- Experiment variant (20-step / 30-step)
- Goal type (lose / maintain / gain)
- Time of day (morning / afternoon / evening installs)
