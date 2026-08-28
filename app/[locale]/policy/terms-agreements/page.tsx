import {
  createLegalPolicyMetadata,
  LegalPolicyPage,
  type LegalPolicyPageProps,
} from "@/components/legal-policy-page";

export function generateMetadata({ params }: LegalPolicyPageProps) {
  return createLegalPolicyMetadata(
    params,
    "Legal.terms",
    "/policy/terms-agreements",
  );
}

export default function TermsAgreementsPage() {
  return <LegalPolicyPage namespace="Legal.terms" />;
}
