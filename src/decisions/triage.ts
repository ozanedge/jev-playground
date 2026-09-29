// PLACEHOLDER decision — the TypeSafe quickstart's support-ticket triage.
// Copy this file's shape for each real decision the app makes: fixed questions,
// one call to Jev, and plain code that turns the typed answers into an action.
import { choice, noul, score } from "@typesafe-ai/sdk";
import { gate } from "@/lib/confidence";
import { jev, JEV_MODEL } from "@/lib/jev";

const questions = {
  department: choice("Which team should handle this", {
    billing: "Payment or subscription issues",
    technical: "Bugs or integration problems",
    sales: "Pricing or account questions",
  }),
  frustration: score("How frustrated the customer appears", [
    "Calm, just stating facts",
    "Frustrated but civil",
    "Very angry, strong language",
  ]),
  urgent: noul("The message conveys urgency or time-sensitivity"),
};

export async function triage(message: string) {
  const { model, answers } = await jev().systemOne({
    model: JEV_MODEL,
    state: { message },
    questions,
  });

  return {
    model,
    department: answers.department.choice,
    route: gate(answers.department.confidence, 0.7),
    frustration: answers.frustration.score,
    urgent: answers.urgent.noul >= 0.5,
    answers,
  };
}
