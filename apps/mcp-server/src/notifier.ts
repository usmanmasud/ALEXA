import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

// Delivers guardian notifications. With NEXUS_GUARDIAN_SNS_TOPIC_ARN set,
// messages go out through Amazon SNS (SMS, email, or push — whatever the
// guardian subscribed to the topic with). Without it, delivery is logged to
// the console so local development and the demo still work end to end.

const TOPIC_ARN = process.env.NEXUS_GUARDIAN_SNS_TOPIC_ARN;

let sns: SNSClient | null = null;

export interface Delivery {
  channel: "sns" | "console";
  messageId?: string;
  error?: string;
}

export async function deliverToGuardian(subject: string, message: string): Promise<Delivery> {
  if (!TOPIC_ARN) {
    console.log(`[notifier] (console delivery) ${subject}: ${message}`);
    return { channel: "console" };
  }

  try {
    sns ??= new SNSClient({ region: process.env.AWS_REGION ?? "us-east-1" });
    const result = await sns.send(
      new PublishCommand({ TopicArn: TOPIC_ARN, Subject: subject.slice(0, 99), Message: message }),
    );
    return { channel: "sns", messageId: result.MessageId };
  } catch (err) {
    console.warn("[notifier] SNS publish failed, logged to console instead:", (err as Error).message);
    return { channel: "console", error: (err as Error).message };
  }
}
