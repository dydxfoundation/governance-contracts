import readline from 'readline';

import config from '../config';

export async function prompt(message: string): Promise<string> {
  if (config.PROMPT_AUTO_YES) {
    console.log(message);
    return 'yes';
  }

  const reader = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  return new Promise((resolve) => {
    reader.question(`${message} `, (reply: string) => {
      reader.close();
      console.log();
      resolve(reply);
    });
  });
}

export async function promptYes(s: string): Promise<void> {
  let response: string | null = null;
  while (!response || response.trim().toLowerCase() !== 'yes') {
    response = await prompt(s);
  }
}
