/** Outgoing email. A stub that records messages; production swaps in SMTP. */
export const sent = [];

export async function sendMail({ to, subject, body }) {
  sent.push({ to, subject, body });
}
