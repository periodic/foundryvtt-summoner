const formatLogMessage = (namespace, msg) =>
  namespace ? `Periodic | ${namespace} | ${msg}` : `Periodic | ${msg}`;

export const log = (namespace) => (msg, ...args) => {
  if (game.settings.get("summoner", "debug")) {
    console.log(formatLogMessage(namespace, msg), ...args);
  }
};

export function require(entity, msg) {
  if (entity === null || entity === undefined) {
    ui.notifications.error(msg);
    throw new Error(msg);
  }
  return entity;
}
