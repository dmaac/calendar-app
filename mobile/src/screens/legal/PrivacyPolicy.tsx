/**
 * PrivacyPolicy — Full privacy policy for Fitsi IA
 * Covers: health data, AI scanning, GDPR, CCPA, Apple/Google compliance
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius } from '../../theme';

const EFFECTIVE_DATE = 'March 21, 2026';
const LAST_UPDATED = 'March 21, 2026';
const CONTACT_EMAIL = 'privacy@fitsi.app';
const COMPANY_NAME = 'Fitsi IA';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return <Text style={styles.paragraph}>{children}</Text>;
}

function BulletList({ items }: { items: string[] }) {
  return (
    <View style={styles.bulletList}>
      {items.map((item, i) => (
        <View key={i} style={styles.bulletRow}>
          <Text style={styles.bullet}>{'\u2022'}</Text>
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export default function PrivacyPolicy({ navigation }: any) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={20} color={colors.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <Text style={styles.effectiveDate}>
          Effective Date: {EFFECTIVE_DATE} | Last Updated: {LAST_UPDATED}
        </Text>

        <Paragraph>
          Welcome to {COMPANY_NAME}. Your privacy is critically important to us.
          This Privacy Policy explains how we collect, use, disclose, and
          safeguard your information when you use our mobile application and
          related services (collectively, the "Service"). By using the Service,
          you consent to the practices described in this policy.
        </Paragraph>

        <Paragraph>
          {COMPANY_NAME} is a nutrition tracking application that uses artificial
          intelligence to analyze food photos and help you track your daily
          caloric and macronutrient intake. We are committed to protecting your
          health and personal data with the highest standards of care.
        </Paragraph>

        {/* 1. Information We Collect */}
        <Section title="1. Information We Collect">
          <Text style={styles.subheading}>1.1 Information You Provide Directly</Text>
          <Paragraph>
            During account creation and our onboarding process, we collect the
            following categories of personal information:
          </Paragraph>
          <BulletList
            items={[
              'Account information: email address, name, password (hashed), and authentication provider (email, Apple, or Google)',
              'Physical characteristics: height, weight, date of birth, and gender',
              'Health and fitness goals: target weight, weight loss/gain speed, workout frequency, and dietary preferences',
              'Dietary information: diet type (e.g., keto, vegan, Mediterranean), food allergies, and health conditions',
              'Nutritional targets: daily calorie goals, macronutrient targets (protein, carbohydrates, fats)',
              'App usage preferences: notification preferences, referral codes, and how you heard about us',
            ]}
          />

          <Text style={styles.subheading}>1.2 Information Collected Through AI Food Scanning</Text>
          <Paragraph>
            When you use our AI-powered food scanning feature, we collect:
          </Paragraph>
          <BulletList
            items={[
              'Food photographs you take or upload from your device',
              'AI-generated nutritional analysis results (calories, macronutrients, food identification)',
              'Image hashes (SHA-256) used for caching to reduce redundant API calls',
              'Meal type classification (breakfast, lunch, dinner, snack)',
              'Any manual edits you make to AI-generated results',
            ]}
          />
          <Paragraph>
            IMPORTANT: Food photographs are transmitted to our servers and
            processed using third-party AI services (OpenAI GPT-4o Vision and
            Anthropic Claude Vision) for nutritional analysis. These images are
            processed in real-time and are not permanently stored by our AI
            providers for training purposes. We retain image references in our
            secure cloud storage (Amazon S3 / Cloudflare R2) linked to your
            account.
          </Paragraph>

          <Text style={styles.subheading}>1.3 Information Collected Automatically</Text>
          <BulletList
            items={[
              'Device information: device type, operating system, unique device identifiers',
              'Usage data: features used, time spent in app, screens viewed, crash logs',
              'IP address and approximate location (city-level, not precise GPS)',
              'App performance data and error logs',
            ]}
          />

          <Text style={styles.subheading}>1.4 Information from Third-Party Services</Text>
          <BulletList
            items={[
              'Apple Sign In or Google Sign In: name and email (as authorized by you)',
              'Apple HealthKit / Google Health Connect: only if you explicitly grant access, and only the data categories you authorize',
              'Payment processors: subscription status and transaction identifiers (we do not receive or store your full payment card details)',
            ]}
          />
        </Section>

        {/* 2. How We Use Your Information */}
        <Section title="2. How We Use Your Information">
          <Paragraph>We use the information we collect for the following purposes:</Paragraph>
          <BulletList
            items={[
              'To provide and personalize the Service, including generating your custom nutrition plan based on your onboarding data',
              'To process food photos through AI and return nutritional analysis',
              'To track your daily food intake, calculate nutritional summaries, and display progress',
              'To manage your account, authentication, and subscription status',
              'To send you push notifications (only with your explicit consent) such as meal reminders and progress updates',
              'To improve our AI food recognition accuracy and overall Service quality',
              'To detect, prevent, and address fraud, abuse, and technical issues',
              'To comply with legal obligations and enforce our Terms of Service',
            ]}
          />
          <Paragraph>
            We do NOT use your health data for advertising purposes. We do NOT
            sell your personal information to third parties.
          </Paragraph>
        </Section>

        {/* 3. AI Processing and Third-Party Data Sharing */}
        <Section title="3. AI Processing and Third-Party Data Sharing">
          <Paragraph>
            Our food scanning feature relies on third-party AI services to
            analyze your food photos. When you scan a meal:
          </Paragraph>
          <BulletList
            items={[
              'Your food photo is transmitted securely (TLS 1.2+) to OpenAI (GPT-4o Vision) or Anthropic (Claude Vision) for analysis',
              'These AI providers process the image to identify food items and estimate nutritional content',
              'AI providers receive only the food image and a structured prompt — no personally identifiable information is attached to the image sent for analysis',
              'Per our data processing agreements, these providers do not use your images to train their models',
              'AI-generated results are cached on our servers using image hashes to minimize redundant API calls and improve response times',
            ]}
          />

          <Text style={styles.subheading}>Other Third-Party Service Providers</Text>
          <BulletList
            items={[
              'Cloud infrastructure: Amazon Web Services (AWS) and Cloudflare for hosting, storage, and content delivery',
              'Database: PostgreSQL hosted on secured cloud infrastructure',
              'Caching: Redis for performance optimization',
              'Payment processing: Apple App Store and Google Play Store handle all subscription payments',
              'Analytics: anonymized usage analytics to improve the Service',
              'Push notifications: Apple Push Notification Service (APNs) and Firebase Cloud Messaging (FCM)',
            ]}
          />
          <Paragraph>
            All third-party service providers are bound by data processing
            agreements that require them to protect your data and use it only for
            the purposes we specify.
          </Paragraph>
        </Section>

        {/* 4. Data Storage and Security */}
        <Section title="4. Data Storage and Security">
          <Paragraph>
            We implement industry-standard security measures to protect your
            personal information:
          </Paragraph>
          <BulletList
            items={[
              'All data in transit is encrypted using TLS 1.2 or higher',
              'Data at rest is encrypted using AES-256 encryption',
              'Passwords are hashed using bcrypt with appropriate cost factors — we never store plaintext passwords',
              'Database access is restricted through network-level controls, authentication, and role-based permissions',
              'Regular security audits and vulnerability assessments are conducted',
              'Access to production systems is limited to authorized personnel with multi-factor authentication',
            ]}
          />
          <Paragraph>
            Your data is stored on servers located in the United States. If you
            are accessing the Service from outside the United States, please be
            aware that your data will be transferred to and processed in the
            United States, where data protection laws may differ from those in
            your jurisdiction.
          </Paragraph>
        </Section>

        {/* 5. Data Retention */}
        <Section title="5. Data Retention">
          <Paragraph>We retain your personal data as follows:</Paragraph>
          <BulletList
            items={[
              'Account data: retained for as long as your account is active',
              'Food logs and nutritional data: retained for as long as your account is active, or until you request deletion',
              'AI scan cache: retained for up to 90 days to optimize performance',
              'Food images: retained for as long as your account is active, or until you request deletion',
              'Anonymized and aggregated data: may be retained indefinitely for analytics and service improvement',
            ]}
          />
          <Paragraph>
            When you delete your account, we will delete or anonymize your
            personal data within 30 days, except where we are required by law to
            retain certain information.
          </Paragraph>
        </Section>

        {/* 6. Your Rights and Choices */}
        <Section title="6. Your Rights and Choices">
          <Text style={styles.subheading}>6.1 All Users</Text>
          <Paragraph>Regardless of your location, you have the right to:</Paragraph>
          <BulletList
            items={[
              'Access your personal data through the app or by contacting us',
              'Correct inaccurate personal data in your profile settings',
              'Delete your account and associated data (available in Profile > Account > Delete Account — accessible within 2 taps)',
              'Export your data in a portable format',
              'Opt out of push notifications at any time through your device settings or in-app preferences',
              'Withdraw consent for optional data processing',
            ]}
          />

          <Text style={styles.subheading}>6.2 European Economic Area (EEA) — GDPR Rights</Text>
          <Paragraph>
            If you are located in the European Economic Area, you have additional
            rights under the General Data Protection Regulation (GDPR):
          </Paragraph>
          <BulletList
            items={[
              'Right to access: obtain a copy of all personal data we hold about you',
              'Right to rectification: correct any inaccurate personal data',
              'Right to erasure ("right to be forgotten"): request deletion of your personal data',
              'Right to data portability: receive your data in a structured, machine-readable format',
              'Right to restrict processing: limit how we use your data',
              'Right to object: object to processing based on legitimate interests',
              'Right to withdraw consent: withdraw consent at any time without affecting prior processing',
              'Right to lodge a complaint with your local data protection authority',
            ]}
          />
          <Paragraph>
            Legal basis for processing: We process your data based on (a) your
            consent (for health data and AI scanning), (b) contractual necessity
            (to provide the Service), and (c) legitimate interests (for security
            and service improvement).
          </Paragraph>

          <Text style={styles.subheading}>6.3 California Residents — CCPA Rights</Text>
          <Paragraph>
            If you are a California resident, the California Consumer Privacy Act
            (CCPA) provides you with additional rights:
          </Paragraph>
          <BulletList
            items={[
              'Right to know: what personal information we collect, use, disclose, and sell',
              'Right to delete: request deletion of your personal information',
              'Right to opt-out of sale: we do NOT sell your personal information',
              'Right to non-discrimination: you will not receive different service quality for exercising your rights',
            ]}
          />
          <Paragraph>
            To exercise any of these rights, contact us at {CONTACT_EMAIL} or
            use the in-app account management features. We will respond to
            verified requests within 30 days (45 days for complex requests, with
            notice).
          </Paragraph>
        </Section>

        {/* 7. Health Data */}
        <Section title="7. Health Data — Special Protections">
          <Paragraph>
            We recognize that health and nutrition data is sensitive. We apply
            additional protections to this data:
          </Paragraph>
          <BulletList
            items={[
              'Health data (weight, height, dietary information, nutritional intake) is collected only with your explicit consent during onboarding',
              'We do not share your health data with advertisers or data brokers',
              'Health data is never used for insurance underwriting, employment decisions, or any discriminatory purpose',
              'If you connect Apple HealthKit or Google Health Connect, we access only the data categories you explicitly authorize, and we do not store HealthKit/Health Connect data on our servers beyond what is necessary for the Service',
              'Per Apple HealthKit guidelines, health data accessed through HealthKit is not used for advertising or sold to third parties',
            ]}
          />
        </Section>

        {/* 8. Children's Privacy */}
        <Section title="8. Children's Privacy">
          <Paragraph>
            {COMPANY_NAME} is not intended for children under the age of 13. We
            do not knowingly collect personal information from children under 13.
            If you are under 16 in the European Economic Area, you must have
            parental consent to use the Service. If we discover that we have
            collected data from a child under the applicable age without
            appropriate consent, we will promptly delete that information. If you
            believe a child has provided us with personal data, please contact us
            at {CONTACT_EMAIL}.
          </Paragraph>
        </Section>

        {/* 9. Cookies and Tracking */}
        <Section title="9. Cookies and Tracking Technologies">
          <Paragraph>
            Our mobile application may use the following technologies:
          </Paragraph>
          <BulletList
            items={[
              'Local storage (AsyncStorage): to store authentication tokens and app preferences on your device',
              'Analytics SDKs: to collect anonymized usage data for service improvement',
              'Crash reporting: to identify and fix technical issues',
            ]}
          />
          <Paragraph>
            If we offer a web version of the Service, it may use cookies and
            similar tracking technologies. You can manage cookie preferences
            through your browser settings.
          </Paragraph>
          <Paragraph>
            We honor "Do Not Track" (DNT) signals where technically feasible. We
            do not engage in cross-app tracking for advertising purposes.
          </Paragraph>
        </Section>

        {/* 10. International Data Transfers */}
        <Section title="10. International Data Transfers">
          <Paragraph>
            Your information may be transferred to and processed in countries
            other than your country of residence. When we transfer data outside
            the EEA, we ensure appropriate safeguards are in place, including:
          </Paragraph>
          <BulletList
            items={[
              'Standard Contractual Clauses (SCCs) approved by the European Commission',
              'Data processing agreements with all service providers',
              'Adequacy decisions where applicable',
            ]}
          />
        </Section>

        {/* 11. Changes to This Policy */}
        <Section title="11. Changes to This Privacy Policy">
          <Paragraph>
            We may update this Privacy Policy from time to time. When we make
            material changes, we will notify you through the app or by email
            before the changes take effect. Your continued use of the Service
            after the effective date of the revised policy constitutes your
            acceptance of the changes.
          </Paragraph>
          <Paragraph>
            We encourage you to review this Privacy Policy periodically. The
            "Last Updated" date at the top indicates when the policy was most
            recently revised.
          </Paragraph>
        </Section>

        {/* 12. Contact Us */}
        <Section title="12. Contact Us">
          <Paragraph>
            If you have questions, concerns, or requests regarding this Privacy
            Policy or our data practices, please contact us:
          </Paragraph>
          <BulletList
            items={[
              `Email: ${CONTACT_EMAIL}`,
              `App: ${COMPANY_NAME}`,
            ]}
          />
          <Paragraph>
            For GDPR-related inquiries, you may also contact our Data Protection
            Officer at the email address above. We will respond to all legitimate
            requests within 30 days.
          </Paragraph>
        </Section>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {COMPANY_NAME} {'\u00A9'} {new Date().getFullYear()}. All rights reserved.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F5F5F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
  },
  scroll: {
    padding: spacing.lg,
    paddingBottom: 60,
  },
  effectiveDate: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: spacing.lg,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
    marginBottom: spacing.sm,
  },
  subheading: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111111',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 22,
    color: '#111111',
    marginBottom: spacing.sm,
  },
  bulletList: {
    marginBottom: spacing.sm,
    paddingLeft: spacing.xs,
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 6,
    paddingRight: spacing.md,
  },
  bullet: {
    fontSize: 14,
    lineHeight: 22,
    color: '#4285F4',
    marginRight: spacing.sm,
    fontWeight: '700',
  },
  bulletText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#111111',
    flex: 1,
  },
  footer: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#8E8E93',
  },
});
