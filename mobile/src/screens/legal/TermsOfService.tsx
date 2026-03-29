/**
 * TermsOfService — Full Terms of Service for Fitsi AI
 * Covers: usage terms, subscriptions, AI disclaimers, medical disclaimers,
 * intellectual property, liability, App Store compliance
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
import { spacing } from '../../theme';

const EFFECTIVE_DATE = 'March 21, 2026';
const LAST_UPDATED = 'March 21, 2026';
const CONTACT_EMAIL = 'support@fitsi.app';
const COMPANY_NAME = 'Fitsi AI';

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

function ImportantBox({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.importantBox}>
      <Text style={styles.importantText}>{children}</Text>
    </View>
  );
}

export default function TermsOfService({ navigation }: any) {
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
          <Ionicons name="chevron-back" size={20} color="#111111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
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
          Welcome to {COMPANY_NAME}. These Terms of Service ("Terms") govern your
          access to and use of the {COMPANY_NAME} mobile application and related
          services (collectively, the "Service"). Please read these Terms
          carefully before using the Service.
        </Paragraph>

        <Paragraph>
          By creating an account, downloading the app, or otherwise accessing the
          Service, you agree to be bound by these Terms. If you do not agree to
          these Terms, do not use the Service.
        </Paragraph>

        {/* 1. Medical Disclaimer */}
        <Section title="1. Medical Disclaimer">
          <ImportantBox>
            {COMPANY_NAME} IS NOT A MEDICAL DEVICE AND DOES NOT PROVIDE MEDICAL
            ADVICE. The Service is intended for general wellness and informational
            purposes only. It is NOT a substitute for professional medical advice,
            diagnosis, or treatment.
          </ImportantBox>

          <Paragraph>
            By using {COMPANY_NAME}, you acknowledge and agree that:
          </Paragraph>
          <BulletList
            items={[
              'The nutritional information provided by our AI is an estimate and may not be 100% accurate. AI-generated food analysis should be treated as approximations, not precise measurements.',
              'You should not rely solely on the Service for making dietary decisions, especially if you have any medical condition, food allergy, eating disorder, or are taking medication.',
              'The caloric and macronutrient targets generated during onboarding are based on general nutritional guidelines and your self-reported data. They are not personalized medical nutrition therapy.',
              'You should always consult a qualified healthcare professional, registered dietitian, or physician before starting any diet, weight loss program, or making significant changes to your eating habits.',
              'If you experience any adverse health effects while using the Service, discontinue use immediately and consult a healthcare professional.',
              'The Service does not diagnose, treat, cure, or prevent any disease or medical condition.',
            ]}
          />

          <ImportantBox>
            CALORIE SAFETY WARNING: Caloric intake plans below 1,200 kcal/day for
            women or 1,500 kcal/day for men may be unsafe without medical
            supervision. If the Service generates a plan below these thresholds,
            please consult your doctor before following it.
          </ImportantBox>
        </Section>

        {/* 2. Eligibility */}
        <Section title="2. Eligibility">
          <Paragraph>To use {COMPANY_NAME}, you must:</Paragraph>
          <BulletList
            items={[
              'Be at least 13 years of age (or 16 in the European Economic Area)',
              'If you are between 13 and 18 (or the age of majority in your jurisdiction), have parental or guardian consent to use the Service',
              'Have the legal capacity to enter into a binding agreement',
              'Not be prohibited from using the Service under applicable law',
            ]}
          />
          <Paragraph>
            By creating an account, you represent and warrant that you meet all
            eligibility requirements. We reserve the right to request proof of age
            or parental consent at any time.
          </Paragraph>
        </Section>

        {/* 3. Account Registration */}
        <Section title="3. Account Registration and Security">
          <Paragraph>
            To access certain features of the Service, you must create an
            account. You agree to:
          </Paragraph>
          <BulletList
            items={[
              'Provide accurate, current, and complete information during registration',
              'Maintain and promptly update your account information',
              'Keep your login credentials confidential and secure',
              'Notify us immediately of any unauthorized use of your account',
              'Accept responsibility for all activities that occur under your account',
            ]}
          />
          <Paragraph>
            You may register using your email address, Apple Sign In, or Google
            Sign In. We are not responsible for any issues arising from
            third-party authentication providers.
          </Paragraph>
        </Section>

        {/* 4. The Service */}
        <Section title="4. Description of the Service">
          <Paragraph>{COMPANY_NAME} provides the following features:</Paragraph>
          <BulletList
            items={[
              'AI-powered food photo scanning that identifies food items and estimates nutritional content (calories, protein, carbohydrates, fats, and other macronutrients)',
              'Personalized nutrition plan generation based on your onboarding profile (goals, body measurements, dietary preferences)',
              'Daily food logging and nutritional intake tracking',
              'Progress dashboards and historical nutritional data visualization',
              'Push notification reminders for meal logging (with your consent)',
            ]}
          />
          <Paragraph>
            The accuracy of AI-generated nutritional estimates depends on image
            quality, food visibility, portion sizes, and the inherent limitations
            of computer vision technology. We continuously work to improve
            accuracy but cannot guarantee precise results.
          </Paragraph>
        </Section>

        {/* 5. AI-Generated Content */}
        <Section title="5. AI-Generated Content Disclaimer">
          <Paragraph>
            The Service uses artificial intelligence (including OpenAI GPT-4o
            Vision and Anthropic Claude Vision) to analyze food photographs and
            generate nutritional estimates. You acknowledge that:
          </Paragraph>
          <BulletList
            items={[
              'AI-generated nutritional data is an approximation and may contain errors',
              'The AI may misidentify foods, especially complex dishes, mixed meals, or regional cuisines',
              'Portion size estimation from photographs has inherent limitations',
              'You have the ability to manually edit any AI-generated result before saving it to your log',
              'We do not guarantee the accuracy, completeness, or reliability of AI-generated content',
              'AI-generated content does not constitute nutritional counseling or medical advice',
            ]}
          />
        </Section>

        {/* 6. Subscriptions and Payments */}
        <Section title="6. Subscriptions, Payments, and Refunds">
          <Text style={styles.subheading}>6.1 Subscription Plans</Text>
          <Paragraph>
            {COMPANY_NAME} offers both free and premium subscription tiers. The
            free tier provides limited functionality, while premium subscriptions
            unlock additional features including unlimited AI food scans.
          </Paragraph>

          <Text style={styles.subheading}>6.2 Billing</Text>
          <BulletList
            items={[
              'All subscription payments are processed through the Apple App Store or Google Play Store',
              'Prices are displayed in your local currency before purchase, including applicable taxes',
              'Subscriptions automatically renew at the end of each billing period unless cancelled at least 24 hours before the renewal date',
              'Your App Store or Play Store account will be charged for renewal within 24 hours prior to the end of the current period',
            ]}
          />

          <Text style={styles.subheading}>6.3 Free Trials and Promotional Offers</Text>
          <BulletList
            items={[
              'Free trial periods, if offered, are available to new subscribers only',
              'If you do not cancel before the free trial ends, your subscription will automatically convert to a paid subscription',
              'Promotional discount offers are one-time and non-transferable',
              'Unused portions of free trials are forfeited upon purchasing a subscription',
            ]}
          />

          <Text style={styles.subheading}>6.4 Cancellation and Refunds</Text>
          <BulletList
            items={[
              'You may cancel your subscription at any time through your device\'s App Store or Play Store subscription settings',
              'Cancellation takes effect at the end of the current billing period — you retain access to premium features until then',
              'We do not provide direct refunds. All refund requests must be submitted through Apple App Store or Google Play Store per their respective refund policies',
              'Deleting the app does not cancel your subscription — you must cancel through your store settings',
            ]}
          />
        </Section>

        {/* 7. User Content */}
        <Section title="7. User Content and Conduct">
          <Text style={styles.subheading}>7.1 Your Content</Text>
          <Paragraph>
            You retain ownership of all content you submit through the Service,
            including food photographs and manual food log entries. By submitting
            content, you grant {COMPANY_NAME} a non-exclusive, worldwide,
            royalty-free license to use, process, and store that content solely
            for the purpose of providing and improving the Service.
          </Paragraph>

          <Text style={styles.subheading}>7.2 Prohibited Conduct</Text>
          <Paragraph>You agree not to:</Paragraph>
          <BulletList
            items={[
              'Use the Service for any illegal purpose or in violation of any applicable law',
              'Upload content that is offensive, harmful, or violates the rights of others',
              'Attempt to reverse-engineer, decompile, or disassemble the Service or its AI models',
              'Interfere with or disrupt the Service, servers, or networks',
              'Use automated means (bots, scrapers) to access the Service',
              'Share your account credentials with others or create multiple accounts',
              'Attempt to circumvent subscription restrictions or payment mechanisms',
              'Use the Service to promote eating disorders or dangerously restrictive diets',
            ]}
          />
        </Section>

        {/* 8. Intellectual Property */}
        <Section title="8. Intellectual Property">
          <Paragraph>
            The Service, including its design, features, content, AI models,
            algorithms, graphics, and software, is owned by {COMPANY_NAME} and
            protected by intellectual property laws. You may not copy, modify,
            distribute, sell, or lease any part of the Service without our prior
            written consent.
          </Paragraph>
          <Paragraph>
            The {COMPANY_NAME} name, logo, and all related marks are trademarks
            of {COMPANY_NAME}. You may not use these marks without our prior
            written permission.
          </Paragraph>
        </Section>

        {/* 9. Privacy */}
        <Section title="9. Privacy">
          <Paragraph>
            Your use of the Service is also governed by our Privacy Policy, which
            describes how we collect, use, and protect your personal information,
            including sensitive health data. The Privacy Policy is incorporated
            into these Terms by reference. By using the Service, you consent to
            the data practices described in the Privacy Policy.
          </Paragraph>
        </Section>

        {/* 10. Account Deletion */}
        <Section title="10. Account Deletion">
          <Paragraph>
            You may delete your account at any time through the app (Profile &gt;
            Account &gt; Delete Account). Upon account deletion:
          </Paragraph>
          <BulletList
            items={[
              'Your personal data will be deleted or anonymized within 30 days',
              'Your food logs, photos, and nutritional history will be permanently removed',
              'Any active subscription must be cancelled separately through your App Store or Play Store settings — account deletion does not automatically cancel subscriptions',
              'Account deletion is irreversible. Once deleted, your data cannot be recovered.',
            ]}
          />
        </Section>

        {/* 11. Disclaimers */}
        <Section title="11. Disclaimers of Warranties">
          <Paragraph>
            THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES
            OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
            IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
            PURPOSE, AND NON-INFRINGEMENT.
          </Paragraph>
          <Paragraph>We do not warrant that:</Paragraph>
          <BulletList
            items={[
              'The Service will be uninterrupted, error-free, or secure',
              'AI-generated nutritional analysis will be accurate or complete',
              'The Service will meet your specific health or dietary requirements',
              'Any defects in the Service will be corrected',
              'Results obtained from the Service will be accurate or reliable',
            ]}
          />
          <Paragraph>
            You use the Service at your own risk. No information or advice
            obtained through the Service creates any warranty not expressly stated
            in these Terms.
          </Paragraph>
        </Section>

        {/* 12. Limitation of Liability */}
        <Section title="12. Limitation of Liability">
          <Paragraph>
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, {COMPANY_NAME},
            ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT
            BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
            PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO:
          </Paragraph>
          <BulletList
            items={[
              'Loss of profits, data, or goodwill',
              'Health issues or adverse effects resulting from following nutritional information provided by the Service',
              'Errors or inaccuracies in AI-generated food analysis',
              'Unauthorized access to or alteration of your data',
              'Any other matter relating to the Service',
            ]}
          />
          <Paragraph>
            IN NO EVENT SHALL OUR TOTAL LIABILITY TO YOU FOR ALL CLAIMS EXCEED
            THE AMOUNT YOU HAVE PAID TO US IN THE TWELVE (12) MONTHS PRECEDING
            THE CLAIM, OR ONE HUNDRED US DOLLARS ($100), WHICHEVER IS GREATER.
          </Paragraph>
          <Paragraph>
            SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OR LIMITATION OF
            CERTAIN DAMAGES. IF THESE LAWS APPLY TO YOU, SOME OR ALL OF THE ABOVE
            LIMITATIONS MAY NOT APPLY, AND YOU MAY HAVE ADDITIONAL RIGHTS.
          </Paragraph>
        </Section>

        {/* 13. Indemnification */}
        <Section title="13. Indemnification">
          <Paragraph>
            You agree to indemnify, defend, and hold harmless {COMPANY_NAME} and
            its officers, directors, employees, and agents from and against any
            claims, liabilities, damages, losses, and expenses (including
            reasonable attorneys' fees) arising out of or related to:
          </Paragraph>
          <BulletList
            items={[
              'Your use or misuse of the Service',
              'Your violation of these Terms',
              'Your violation of any third-party rights',
              'Any content you submit through the Service',
              'Your reliance on AI-generated nutritional information without consulting a healthcare professional',
            ]}
          />
        </Section>

        {/* 14. Third-Party Services */}
        <Section title="14. Third-Party Services">
          <Paragraph>
            The Service may integrate with or contain links to third-party
            services, including:
          </Paragraph>
          <BulletList
            items={[
              'Apple HealthKit and Google Health Connect',
              'Apple App Store and Google Play Store for payments',
              'AI service providers (OpenAI, Anthropic) for food analysis',
              'Cloud infrastructure providers',
            ]}
          />
          <Paragraph>
            We are not responsible for the availability, accuracy, or content of
            third-party services. Your use of third-party services is governed by
            their respective terms and privacy policies.
          </Paragraph>
        </Section>

        {/* 15. Modifications */}
        <Section title="15. Modifications to the Service and Terms">
          <Paragraph>
            We reserve the right to modify, suspend, or discontinue the Service
            (or any part thereof) at any time, with or without notice. We may
            also update these Terms from time to time. When we make material
            changes:
          </Paragraph>
          <BulletList
            items={[
              'We will notify you through the app or via email at least 30 days before the changes take effect',
              'The updated Terms will be posted within the app with a new "Last Updated" date',
              'Your continued use of the Service after the effective date constitutes acceptance of the revised Terms',
              'If you do not agree to the updated Terms, you must stop using the Service and delete your account',
            ]}
          />
        </Section>

        {/* 16. Termination */}
        <Section title="16. Termination">
          <Paragraph>
            We may suspend or terminate your access to the Service at any time,
            with or without cause and with or without notice, if:
          </Paragraph>
          <BulletList
            items={[
              'You violate these Terms or any applicable law',
              'Your conduct may harm other users, us, or third parties',
              'We are required to do so by law',
              'We discontinue the Service',
            ]}
          />
          <Paragraph>
            Upon termination, your right to use the Service ceases immediately.
            Sections that by their nature should survive termination (including
            disclaimers, limitation of liability, and indemnification) will
            survive.
          </Paragraph>
        </Section>

        {/* 17. Governing Law */}
        <Section title="17. Governing Law and Dispute Resolution">
          <Paragraph>
            These Terms shall be governed by and construed in accordance with the
            laws of Chile, without regard to its conflict of law provisions.
          </Paragraph>
          <Paragraph>
            Any disputes arising out of or relating to these Terms or the Service
            shall first be attempted to be resolved through good-faith
            negotiation. If negotiation fails, disputes shall be resolved through
            binding arbitration in Santiago, Chile, except where prohibited by
            law. Nothing in these Terms prevents you from filing a complaint with
            your local consumer protection authority.
          </Paragraph>
          <Paragraph>
            For users in the European Union: you retain the right to bring claims
            in your country of residence and are entitled to the protections of
            mandatory consumer protection laws of your jurisdiction.
          </Paragraph>
        </Section>

        {/* 18. Apple/Google Terms */}
        <Section title="18. App Store Additional Terms">
          <Paragraph>
            If you downloaded {COMPANY_NAME} from the Apple App Store or Google
            Play Store, the following additional terms apply:
          </Paragraph>
          <BulletList
            items={[
              'Apple and Google are not parties to these Terms and have no obligation to provide maintenance or support for the Service',
              'In the event of any failure of the Service to conform to applicable warranties, you may notify Apple/Google for a refund of the purchase price (if any); beyond that, Apple/Google have no warranty obligations',
              'Apple and Google are not responsible for addressing any claims by you or third parties relating to the Service or your use of it',
              'Apple and Google are third-party beneficiaries of these Terms and may enforce them against you',
              'You represent that you are not located in a country subject to a US Government embargo or designated as a "terrorist supporting" country',
            ]}
          />
        </Section>

        {/* 19. Severability */}
        <Section title="19. General Provisions">
          <BulletList
            items={[
              'Severability: If any provision of these Terms is found to be unenforceable, the remaining provisions will continue in full force and effect.',
              'Entire Agreement: These Terms, together with the Privacy Policy, constitute the entire agreement between you and us regarding the Service.',
              'Waiver: Our failure to enforce any right or provision of these Terms does not constitute a waiver of that right or provision.',
              'Assignment: You may not assign or transfer these Terms without our prior written consent. We may assign our rights and obligations without restriction.',
              'Force Majeure: We shall not be liable for any failure or delay in performance due to circumstances beyond our reasonable control.',
            ]}
          />
        </Section>

        {/* 20. Contact */}
        <Section title="20. Contact Us">
          <Paragraph>
            If you have any questions about these Terms of Service, please
            contact us:
          </Paragraph>
          <BulletList
            items={[
              `Email: ${CONTACT_EMAIL}`,
              `App: ${COMPANY_NAME}`,
            ]}
          />
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
  importantBox: {
    backgroundColor: '#FFF5F0',
    borderLeftWidth: 3,
    borderLeftColor: '#4285F4',
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  importantText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#111111',
    fontWeight: '600',
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
