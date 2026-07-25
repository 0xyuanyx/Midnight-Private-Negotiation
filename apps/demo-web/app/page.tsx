import { NegotiationDapp } from "./NegotiationDapp";

export default function Home() {
  return <NegotiationDapp initialNow={new Date().toISOString()} />;
}
