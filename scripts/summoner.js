import * as Util from "./util.js";

const SOCKET_NAME = "module.summoner";
const log = Util.log("Summoner");

Hooks.on("ready", onReady);

export function onReady() {
  console.log("Summoner | Initializing...");
  game.socket.on(SOCKET_NAME, receiveMessage);

  game.settings.register("summoner", "debug", {
    name: "Debug",
    hint: "",
    scope: "client",
    default: false,
    type: Boolean,
    config: true,
  });

  window.Summoner = {
    placeAndSummon,
    placeAndSummonFromSpell,
    placeAndSummonPolymorphed,
    dismiss,
  };

  log("Initialized");
}

/**
 * Summons have the following fields:
 */
export function placeAndSummon(
  actor,
  minionName,
  overrides = {},
  options = {}
) {
  chooseSquare((x, y) => {
    sendSummonRequest(actor, minionName, x, y, overrides, options);
  });
}

export function placeAndSummonFromSpell(
  actor,
  spell,
  minionName,
  overrides = {}
) {
  return game.dnd5e.applications.AbilityUseDialog.create(spell).then(
    (configuration) =>
      chooseSquare(async (x, y) => {
        // Following logic ripped from DnD5e system.  Item5e.roll.
        const spellLevel =
          configuration.level === "pact"
            ? actor.data.data.spells.pact.level
            : parseInt(configuration.level);

        const consumeQuantity = spell.data.uses?.autoDestroy;
        const consumeUsage = Boolean(configuration.consumeUse);
        const consumeRecharge = Boolean(configuration.consumeRecharge);
        const consumeResource = Boolean(configuration.consumeResource);
        const consumeSpellSlot =
          Boolean(configuration.consumeSlot) &&
          (configuration.level === "pact" ? "pact" : `spell${spellLevel}`);

        // Determine whether the item can be used by testing for resource consumption
        const usage = spell._getUsageUpdates({
          consumeRecharge,
          consumeResource,
          consumeSpellSlot,
          consumeUsage,
          consumeQuantity,
        });
        if (!usage) return;
        const { actorUpdates, itemUpdates, resourceUpdates } = usage;

        // Commit pending data updates
        if (!isObjectEmpty(itemUpdates)) await spell.update(itemUpdates);
        if (consumeQuantity && spell.data.data.quantity === 0)
          await spell.delete();
        if (!isObjectEmpty(actorUpdates)) await actor.update(actorUpdates);
        if (!isObjectEmpty(resourceUpdates)) {
          const resource = actor.items.get(id.consume?.target);
          if (resource) await resource.update(resourceUpdates);
        }
        // End Item5e.roll logic

        const spellLevelOverride = {
          actorData: { data: { attributes: { spellLevel } } },
        };
        sendSummonRequest(
          actor,
          minionName,
          x,
          y,
          mergeObject(overrides, spellLevelOverride, { inplace: false }),
          { setSpellBonuses: true }
        );
      })
  );
}

export async function placeAndSummonPolymorphed(
  actor,
  minionName,
  polymorphOptions = {}
) {
  const polymorphFolder = Util.require(
    game.folders.getName(minionName),
    `Could not find folder of polymorphs. Only entities in the "${minionName}" folder can be used as polymorphs.`
  );
  const html = await renderTemplate(
    "/modules/summoner/templates/choose_polymorph.html",
    {
      minionName,
      polymorphOptions: polymorphFolder.content.map((a) => a.name),
    }
  );
  const { polymorphName } = await new Promise((resolve) => {
    const dialog = new Dialog({
      title: `Summon ${minionName}`,
      content: html,
      buttons: {
        cast: {
          icon: '<i class="fas fa-magic"></i>',
          label: "Summon",
          callback: (html) =>
            resolve(
              new FormDataExtended(html[0].querySelector("form")).toObject()
            ),
        },
      },
      default: "cast",
      close: () => resolve({}),
    });
    dialog.render(true);
  });

  if (!polymorphName) {
    return;
  }

  return placeAndSummon(
    actor,
    minionName,
    {},
    { polymorph: { ...polymorphOptions, name: polymorphName } }
  );
}

export function dismiss(minionName) {
  sendDismissRequest(minionName);
}

/**
 * Updates all items on the token with a saving throw to have the actor's spell
 * save DC. This is a convenience to set up saves because there is otherwise no
 * good way to get a flat amount.
 *
 * TODO: is there a way to set these values on items when creating a token?
 *
 * @param {Actor} actor
 * @param {Token} token
 */
export function updateSpellDcsFromActor(actor, token) {
  const dc = actor.data.data.attributes.spelldc;
  // The updates have to be reduced to make sure they are sequenced otherwise
  // they will cancel each other.
  // TODO: Can this be done in a bulk update?
  return token.actor.items.reduce(
    (promise, item) =>
      promise.then(() =>
        item.update({ "data.save.dc": dc, "data.save.scaling": "flat" })
      ),
    Promise.resolve()
  );
}

export function getSpellBonusesFromActor(actor) {
  const actorData = actor.data.data;
  const attackBonus =
    actorData.attributes.prof +
    (actorData.attributes.spellcasting
      ? actorData.abilities[actorData.attributes.spellcasting].mod
      : 0);
  return {
    actorData: {
      data: {
        bonuses: {
          spell: { dc: actorData.attributes.spelldc - 10 }, // This does not work?
          rsak: {
            attack: `${actorData.bonuses.rsak.attack} + ${attackBonus}`,
            damage: actorData.bonuses.rsak.damage,
          },
          msak: {
            attack: `${actorData.bonuses.msak.attack} + ${attackBonus}`,
            damage: actorData.bonuses.msak.damage,
          },
        },
      },
    },
  };
}

const PLACE_TOKEN_HIGHLIGHT_LAYER = "PlaceToken";
const PLACE_TOKEN_HIGHLIGHT_COLOR = 0x3366cc;
const PLACE_TOKEN_HIGHLIGHT_BORDER = 0x000000;

function chooseSquare(callback) {
  const highlightLayer = canvas.grid.addHighlightLayer(
    PLACE_TOKEN_HIGHLIGHT_LAYER
  );

  const leftClickListener = function (event) {
    const scenePos = event.data.getLocalPosition(highlightLayer);
    const [x, y] = canvas.grid.getTopLeft(scenePos.x, scenePos.y);

    highlightLayer.clear();
    canvas.stage.off("mousedown", leftClickListener);
    canvas.stage.off("mousemove", moveListener);

    canvas.grid.destroyHighlightLayer(PLACE_TOKEN_HIGHLIGHT_LAYER);

    callback(x, y);
  };

  let lastMoveTime = 0;
  const moveListener = function (event) {
    // event.stopPropagation();
    const now = Date.now();
    if (now - lastMoveTime <= 30) return;
    const scenePos = event.data.getLocalPosition(highlightLayer);
    const [x, y] = canvas.grid.getTopLeft(scenePos.x, scenePos.y);
    highlightLayer.clear();
    canvas.grid.grid.highlightGridPosition(highlightLayer, {
      x,
      y,
      color: PLACE_TOKEN_HIGHLIGHT_COLOR,
      border: PLACE_TOKEN_HIGHLIGHT_BORDER,
    });
    lastMoveTime = now;
  };

  canvas.stage.on("mousedown", leftClickListener);
  canvas.stage.on("mousemove", moveListener);
}

function sendSummonRequest(actor, name, x, y, overrides, options) {
  log("Sending summon request");
  const user = game.user;
  const message = {
    action: "summon",
    summonerUserId: user.id,
    summonerActorId: actor.id,
    name,
    x,
    y,
    overrides,
    options,
  };
  dispatchMessage(message);
}

function sendDismissRequest(name) {
  const user = game.user;
  const message = { action: "dismiss", userId: user.id, name };

  dispatchMessage(message);
}

function dispatchMessage(message) {
  if (game.user.isGM) {
    receiveMessage(message);
  } else {
    game.socket.emit(SOCKET_NAME, message);
  }
}

function receiveMessage(message) {
  if (game.user.id !== game.users.filter((u) => u.isGM)[0]?.id) {
    // Skip anyone who isn't the first GM.
    return;
  }
  log("Received message: ", message);
  switch (message.action) {
    case "summon":
      return createSummonedToken(message);
    case "dismiss":
      return dismissSummonedTokens(message);
    default:
      console.error("Periodic | Received unknown message.", message);
  }
}

function canSummon(user, actor) {
  return actor?.hasPerm(user, CONST.ENTITY_PERMISSIONS.OWNER);
}

export async function createSummonedToken({
  name,
  summonerActorId,
  summonerUserId,
  x,
  y,
  overrides = {},
  options = { setSpellBonuses: false, polymorph: {} },
}) {
  const user = Util.require(
    game.users.get(summonerUserId),
    `User ${summonerUserId} does not exist from request to summon ${name}.`
  );

  const summonerActor = Util.require(
    game.actors.get(summonerActorId),
    `Actor ${summonerActorId} does not exist from request to summon ${name}.`
  );

  const summonFolder = Util.require(
    game.folders.getName("Summons"),
    `Could not find summons folder. Only entities in the "Summons" folder can be summoned.`
  );
  const summonActor = Util.require(
    summonFolder.content.find((a) => a.name === name),
    `Recieved request to summon ${name} that cannot be found in the "Summons" folder.`
  );

  if (!canSummon(user, summonActor)) {
    throw Error(
      `User ${user.name} needs ownership on ${name} to perform summoning actions`
    );
  }

  log(
    `Summoning ${name} on behalf of ${summonerActor.name}(${user.name}) at (${x}, ${y})`,
    overrides
  );

  const token = await Token.fromActor(summonActor, {
    ...mergeObject(
      // Start with the derived bonuses, then apply overrides.
      options.setSpellBonuses ? getSpellBonusesFromActor(summonerActor) : {},
      overrides,
      { inplace: true }
    ),
    x,
    y,
  });

  return Token.create(token.data).then(async (token) => {
    if (options.polymorph) {
      await polymorphToken(token, options.polymorph);
    }
    if (options.setSpellBonuses) {
      await updateSpellDcsFromActor(summonerActor, token);
    }
    return token;
  });
}

function polymorphToken(token, polymorph) {
  const polymorphFolder = Util.require(
    game.folders.getName(token.actor.name),
    `Could not find folder of polymorphs. Only entities in the "${token.actor.name}" folder can be used as polymorphs.`
  );
  const polymorphActor = Util.require(
    polymorphFolder.content.find((a) => a.name === polymorph.name),
    `Recieved request to polymorph "${token.name}" to "${polymorph.name}" that cannot be found in the "${token.actor.name}" folder.`
  );

  if (token.actor.transformInto) {
    return token.actor.transformInto(polymorphActor, polymorph);
  } else {
    const from = token.actor.data;
    const to = polymorphActor.data;
    const name =`${to.name} (${from.name})`;
    const newData = {
        ...to.token,
        actorLink: from.token.actorLink,
        actorId: from.token.actorId,
        name,
        actorData: {
          type: from.type,
          name, 
          data: to.data,
          items: to.items.concat(from.items),
          img: to.img,
          permission: from.permission,
          folder: from.folder,
          flags: from.flags,
        }
    };
    return token.update(newData)
  }
}

export function dismissSummonedTokens({ name, userId }) {
  const user = game.users.get(userId);
  const summonFolder = game.folders.getName("Summons");
  const summonActor = summonFolder?.collection.getName(name);

  if (!canSummon(user, summonActor)) {
    console.error(
      `User ${userId} needs ownership on ${name} to perform summoning actions`
    );
    return;
  }

  return Promise.all(
    summonActor.getActiveTokens().map((token) => token.delete())
  );
}
