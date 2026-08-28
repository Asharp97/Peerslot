import {
  createLegalPolicyMetadata,
  LegalPolicyPage,
  type LegalPolicyPageProps,
} from "@/components/legal-policy-page";

export function generateMetadata({ params }: LegalPolicyPageProps) {
  return createLegalPolicyMetadata(params, "Legal.cookies", "/policy/cookies");
}

export default function CookiePolicyPage() {
  return <LegalPolicyPage namespace="Legal.cookies" />;
}
