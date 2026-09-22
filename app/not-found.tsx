import { NotFoundPage } from "@/components/not-found-page";

export default function NotFound() {
  return (
    <NotFoundPage
      copy={{
        eyebrow: "Page not found",
        title: "This booking page is no longer available",
        body: "The link may have expired, or the provider may have unpublished their booking page. Return to PeerSlot and try another link.",
        home: "Go to PeerSlot",
        back: "Go back",
      }}
    />
  );
}
