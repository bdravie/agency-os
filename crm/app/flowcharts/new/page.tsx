import TemplatePicker from "@/components/flowcharts/TemplatePicker";
import { PageHeader } from "@/components/ui";
import { loadTemplates } from "@/lib/flowchartTemplates";

export const metadata = { title: "New flowchart" };

export default async function NewFlowchart() {
  return (
    <>
      <PageHeader title="New flowchart" description="Pick a starting point. You can change everything once it opens." back={{ href: "/flowcharts", label: "Flowcharts" }} />
      <TemplatePicker templates={await loadTemplates()} />
    </>
  );
}
