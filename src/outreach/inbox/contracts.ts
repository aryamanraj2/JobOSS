import type { ProviderMessageRef } from '../../core/interfaces/providers.js'
import type { GmailMessage } from '../mail/gmail.js'

/** Additive transport contract pending incorporation in shared ProviderMessageRef. */
export type DeliveryMessageRef = ProviderMessageRef & { rfc822MessageId?: string | null }
export type InboxPage = { messages: Array<{ id: string; threadId: string }>; nextPageToken: string | null }
export interface InboxProvider {
  listInboxPage(query: string, pageToken?: string, maxResults?: number): Promise<InboxPage>
  getMessage(id: string): Promise<GmailMessage>
}
export function isInboxProvider(value: unknown): value is InboxProvider {
  return typeof value === 'object' && value !== null &&
    'listInboxPage' in value && typeof value.listInboxPage === 'function' &&
    'getMessage' in value && typeof value.getMessage === 'function'
}
