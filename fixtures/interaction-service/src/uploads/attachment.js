export function uploadAttachment(client, messageId, name, body) {
  return client.put(`attachments/${messageId}/${name}`, body);
}
