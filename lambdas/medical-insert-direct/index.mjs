import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

const TABLE_NAME = process.env.MEDICAL_RESULTS_TABLE ?? "trially-medical-results";
const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION ?? "us-east-1" });

const DIRECT_INSERT = {
  id: "direct-insert-" + Date.now(),
  createdAt: new Date().toISOString(),
  input: JSON.stringify({
    text: "Patient presented with headache and hypertension. Prescribed lisinopril 10mg daily.",
    operations: ["detect_entities", "detect_phi"],
  }),
  result: JSON.stringify({
    status: "success",
    entities: [
      { Text: "headache", Type: "MEDICAL_CONDITION", Score: 0.98 },
      { Text: "hypertension", Type: "MEDICAL_CONDITION", Score: 0.99 },
      { Text: "lisinopril", Type: "MEDICATION_NAME", Score: 0.97 },
    ],
    phi: [],
    icd10: [],
    rx_norm: [],
    snomed: [],
  }),
};

export const handler = async () => {
  await dynamo.send(
    new PutItemCommand({
      TableName: TABLE_NAME,
      Item: {
        id: { S: DIRECT_INSERT.id },
        createdAt: { S: DIRECT_INSERT.createdAt },
        input: { S: DIRECT_INSERT.input },
        result: { S: DIRECT_INSERT.result },
      },
    })
  );
  return { id: DIRECT_INSERT.id, createdAt: DIRECT_INSERT.createdAt, stored: true };
};
