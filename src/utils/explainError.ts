// Turns provider/backend error strings into something a non-technical user can
// act on: a short headline, one plain sentence, and at most two steps.
// Raw text stays available for support tickets, but never as the first thing shown.

export interface ExplainedError {
  title: string;
  message: string;
  steps: string[];
  tone: 'blocked' | 'setup' | 'retry' | 'content';
}

interface Rule {
  match: RegExp;
  explain: (raw: string) => ExplainedError;
}

const RULES: Rule[] = [
  {
    match: /api access blocked|code 200/i,
    explain: () => ({
      title: 'Instagram is blocking this app',
      message: 'Meta refused the request for this account, so nothing was sent.',
      steps: ['Check the app and its Instagram use case in Meta’s dashboard.', 'Reconnect Instagram in API Connections.'],
      tone: 'blocked',
    }),
  },
  {
    match: /threads_delete/i,
    explain: () => ({
      title: 'Threads needs a permission',
      message: 'This connection cannot delete posts yet.',
      steps: ['Reconnect Threads in API Connections.', 'Approve the new permission, then retry.'],
      tone: 'setup',
    }),
  },
  {
    match: /only works when the account is connected via a facebook page/i,
    explain: () => ({
      title: 'Instagram cannot delete here',
      message: 'Meta only allows API deletes for Instagram connected through a Facebook Page.',
      steps: ['Delete the post in the Instagram app.', 'Or connect Instagram through a Facebook Page.'],
      tone: 'setup',
    }),
  },
  {
    match: /parameter .* is required|code 100\b|invalid parameter|unsupported post request/i,
    explain: () => ({
      title: 'The platform rejected the request',
      message: 'Meta did not accept how this post was built — this is a bug in this app, not your content.',
      steps: ['Press Retry once.', 'If it repeats, copy the technical details and send them to support.'],
      tone: 'retry',
    }),
  },
  {
    match: /does not have permission|code 10\b|insufficient permission|permission/i,
    explain: () => ({
      title: 'Not allowed by the platform',
      message: 'The account is connected, but this action needs a permission Meta has not granted.',
      steps: ['Reconnect the account in API Connections.', 'If asked, enable the permission for the app in Meta’s dashboard.'],
      tone: 'setup',
    }),
  },
  {
    match: /code 190|session has expired|session has been invalidated|invalid.*token|expired token/i,
    explain: () => ({
      title: 'Sign-in expired',
      message: 'The saved login is no longer valid.',
      steps: ['Reconnect this account in API Connections.', 'Then press Retry.'],
      tone: 'setup',
    }),
  },
  {
    match: /rate limit|too many|code 4\b|code 17\b|code 32\b|code 613|80002/i,
    explain: () => ({
      title: 'Slow down for a moment',
      message: 'The platform is limiting how fast you post. Nothing is lost.',
      steps: ['Wait a few minutes, then press Retry.'],
      tone: 'retry',
    }),
  },
  {
    match: /not reachable|cannot be downloaded|530|public address|cloudflare|503|502/i,
    explain: () => ({
      title: 'Meta could not fetch your file',
      message: 'Your public link was unreachable, so the media could not be prepared.',
      steps: ['Start the Cloudflare tunnel on this computer.', 'Press Check, then Retry.'],
      tone: 'setup',
    }),
  },
  {
    match: /not in shared media storage|not on shared storage|browser-only/i,
    explain: () => ({
      title: 'File is only in your browser',
      message: 'The scheduler can only send files saved on this computer.',
      steps: ['Re-open the post and upload the file again.', 'Save, then press Retry.'],
      tone: 'setup',
    }),
  },
  {
    match: /allows \d+ characters|caption is \d+ characters/i,
    explain: (raw) => ({
      title: 'Caption too long',
      message: raw.replace(/^[A-Za-z]+:\s*/, ''),
      steps: ['Shorten the caption or hashtags for that channel.', 'Save, then publish again.'],
      tone: 'content',
    }),
  },
  {
    match: /still processing|timeout|timed out|did not finish/i,
    explain: () => ({
      title: 'Platform took too long',
      message: 'Your file uploaded, but processing did not finish in time.',
      steps: ['Press Retry — it usually works the second time.'],
      tone: 'retry',
    }),
  },
  {
    match: /carousel needs at least 2|at most 10|at most 20/i,
    explain: () => ({
      title: 'Wrong number of files',
      message: 'A carousel on this channel has a fixed item limit.',
      steps: ['Adjust the files to fit the limit.', 'Save, then publish again.'],
      tone: 'content',
    }),
  },
  {
    match: /set to (reel|video thread).*no (video|file)|none of the attached files is a video|feed post but none/i,
    explain: () => ({
      title: 'File and format do not match',
      message: 'The post is set to video, but the file is not a video (or the reverse).',
      steps: ['Attach a matching file, or change the channel format.', 'Save, then publish again.'],
      tone: 'content',
    }),
  },
  {
    match: /no media attached|has no media|nothing to publish/i,
    explain: () => ({
      title: 'No media attached',
      message: 'Channels need at least one picture or video.',
      steps: ['Attach a file and save.', 'Then press Publish now.'],
      tone: 'content',
    }),
  },
  {
    match: /scheduled window passed|offline \d+ minutes/i,
    explain: () => ({
      title: 'Scheduled time was missed',
      message: 'The app was not running at that time, so the post was skipped.',
      steps: ['Press Publish now to send it late.', 'Keep the schedule service running for future posts.'],
      tone: 'retry',
    }),
  },
  {
    match: /too large|1 gb|413/i,
    explain: () => ({
      title: 'File is too large',
      message: 'The limit is 1 GB per file.',
      steps: ['Compress or trim the file, then upload again.'],
      tone: 'content',
    }),
  },
  {
    match: /file type is not supported/i,
    explain: () => ({
      title: 'File type not supported',
      message: 'This channel cannot accept that format.',
      steps: ['Use MP4, MOV or WebM for video; JPG, PNG or WebP for pictures.', 'Upload again.'],
      tone: 'content',
    }),
  },
  {
    match: /no file was included|upload did not finish|could not be copied|could not be removed|could not be saved/i,
    explain: () => ({
      title: 'File did not save',
      message: 'The copy into shared storage failed, so the post cannot use it.',
      steps: ['Make sure the schedule service is running.', 'Upload the file again.'],
      tone: 'setup',
    }),
  },
  {
    match: /not connected|connect it first|not connected on this machine/i,
    explain: () => ({
      title: 'Account not connected',
      message: 'This app has no valid sign-in for that channel.',
      steps: ['Connect it in API Connections.', 'Then press Retry.'],
      tone: 'setup',
    }),
  },
  {
    match: /unreachable|failed to fetch|network|econnrefused|econnreset|load failed/i,
    explain: () => ({
      title: 'Schedule service is off',
      message: 'The local service that publishes posts is not running.',
      steps: ['Run “pnpm dev:server” and leave it running.', 'Reload this page, then press Retry.'],
      tone: 'setup',
    }),
  },
  {
    match: /cancelled|canceled|access_denied|user denied/i,
    explain: () => ({
      title: 'Sign-in cancelled',
      message: 'No permission was granted and nothing changed.',
      steps: ['Press Connect again and finish the approval.'],
      tone: 'setup',
    }),
  },
];

const FALLBACK: Rule = {
  match: /./,
  explain: () => ({
    title: 'Platform refused the post',
    message: 'Meta returned an error this app does not recognise.',
    steps: ['Press Retry once.', 'If it repeats, copy the technical details for support.'],
    tone: 'retry',
  }),
};

export function explainError(raw?: string | null): ExplainedError | null {
  if (!raw) return null;
  const rule = RULES.find((r) => r.match.test(raw)) || FALLBACK;
  return rule.explain(raw);
}

// One short line for cards and toasts.
export function friendlyErrorTitle(raw?: string | null): string | null {
  return explainError(raw)?.title ?? null;
}
