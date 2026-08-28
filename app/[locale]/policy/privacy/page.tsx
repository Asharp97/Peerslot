import {
  createLegalPolicyMetadata,
  LegalPolicyPage,
  type LegalPolicyPageProps,
} from "@/components/legal-policy-page";

export function generateMetadata({ params }: LegalPolicyPageProps) {
  return createLegalPolicyMetadata(params, "Legal.privacy", "/policy/privacy");
}

export default function PrivacyPage() {
  return <LegalPolicyPage namespace="Legal.privacy" />;
}
