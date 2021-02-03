const formatLogMessage = (msg: string) => `Summoner | ${msg}`;

export const log = (msg: string, ...args: any[]) => {
  if (game.settings.get("summoner", "debug")) {
    console.log(formatLogMessage(msg), ...args);
  }
};

export function require<T>(entity: null | undefined | T, msg: string): T {
  if (entity === null || entity === undefined) {
    log(msg);
    ui.notifications.error(msg);
    throw new Error(msg);
  }
  return entity;
}
