export type CodingIntent = 'build' | 'fix' | 'polish' | 'test';
export const CODING_ACTIONS: { id: CodingIntent; label: string; draft: string }[] = [
  { id: 'build', label: 'Build', draft: '' },
  { id: 'fix', label: 'Fix', draft: 'Find and fix the issue in this project: ' },
  { id: 'polish', label: 'Polish', draft: 'Improve this app’s design and usability while keeping its existing features working.' },
  { id: 'test', label: 'Test', draft: 'Run the relevant checks for this project, fix the failures you find, and verify the result.' },
];

export function codingPrompt(text: string, paths: string[], intent?: CodingIntent): string {
  const references = paths.length ? `\n\nWorkspace file references (read current contents before editing):\n${paths.map(path => `- ${JSON.stringify(path)}`).join('\n')}` : '';
  const workflow = intent ? `\n\nProject task (${intent}): implement and verify this request in the existing workspace.` : '';
  return text.trim() + references + workflow;
}

export function localPreviewUrl(value: string): string {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password) {
    throw new Error('Use a running local app, such as http://localhost:5173.');
  }
  return url.href;
}
