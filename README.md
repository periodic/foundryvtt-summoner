# foundryvtt-summoner

A module to help with summoning tokens in the Foundry Virtual Tabletop.  It allows players to place and remove select tokens that they control through scripts.  These can be attached to macros to make it easy for players to summon and dismiss their minions.

Additionally, the token data can be overridden on a case-by-case basis to provide customization based on the summoning conditions.

There is also some additional support for common D&D situations.

See the Issues tab to file bug reports and make feature requests.

## Dependencies

While this module does not have any hard dependencies, there are some other modules that make it easier to use or for which it has special support.

* [Item Macro](https://foundryvtt.com/packages/itemacro/) - This can be used to attach macros to items, which is a convinient way to store them.  There is also a setting to replace the invocation of items with their macro, which allows you to replace the default behavior with the summonind behavior.
* [The Furnace](https://foundryvtt.com/packages/furnace/) - When you enable advanced macros you can have access to references for the actor and item invoking an item macro within the macro.  This makes it much easier to supply those values to the Summoner functions.
* [D&D 5E](https://foundryvtt.com/packages/dnd5e/) - There is special support for working with D&D 5E summons.  See below.

## Usage

### Setup

Once you have the module installed you will have to set up actors that can be summoned.  The module only allows players to summon actors for tokens that are in a folder called "Summons" and that they have ownership rights to.  Create that folder (the name must be exact) then place actors in there that represent the entities you want to summon.

### Basic Summoning

Next, create a macro that will summon the token like so:

```javascript
Summoner.placeAndSummon(
  summonerActor,
  "My Minion",
);
```

This macro will do a few things:

* It will prompt the user to place the token somewhere.
* It will look up the actor by name ("My Minion") in the "Summons" folder.
* It will verify that the player has ownership of the token.
* It will create a token for the player.

### Dismissing a token

You can dismiss tokes with another simple script:

```javascript
Summoner.dismiss("My Minion");
```

This will also verify ownership of the named actor and that it is in the "Summons" folder.  Then it will delete all tokens owned by that actor.

**Missing Feature Warning**: There is currently not a way to dismiss individual tokens and thus no way for two players to share the same actor and summon at the same time without dismissing each other's tokens.  Instead make a separate actor for each player, e.g. "Alice's Minion" and "Bob's Minion".

### Overriding values

You can also override values on the created token to customize the token created.  This can handle various options for summoning or do things like scale the token to the summoner.

```javascript
Summoner.placeAndSummon(
  summonerActor,
  "My Minion",
  {
      actorData: actorOverrides
  },
);
```

### D&D 5E Support

There is also support for D&D 5E summoning which often comes from a spell or otherwise has the summoned enitiy take on attributes of the caster.

You can have the summoned creature automatically gain a bonus to ranged and melee spell attacks and have the DC on all its abilities set to the DC of the caster by passing in the `setSpellBonuses` option.  With this option you should make sure that all summoned actor has a **spell casting ability of "None"** to avoid double-counting bonuses.

```javascript
Summoner.placeAndSummon(
  actor,
  "Wildfire Spirit",
  {},
  { setSpellBonuses: true }
);
```

Additionally, if you are casting a spell these is a utility functon that will prompt the player for the spell slot and resource consumption before summoning the minion.  The minion will get the same spell bonuses as with `setSpellBonuses` but will also get an attribute for the `spellLevel` which can be used in formulas.

Note that you also must pass in the spell item in this case, which is simple if you are using Item Macro and The Furnace.

```javascript
Summoner.placeAndSummonFromSpell(actor, item, "Flaming Sphere");
```

Damage formula would then look something like `(@attributes.spellLevel)d6`.

### Tips and Tricks

* You can place the dismiss ability on either the player's main actor or the summoned actor.  It's better organized to have it on the summoned actor.

### Examples

Summon using an actor without having advanced or item macros.

```javascript
await Summoner.placeAndSummon(
  game.actors.getName("My Character"),
  "Companion",
);
```

Dismiss a token before summoning a replacement, using advanced macros from The Furnace and Item Macros to get the `actor`.

```javascript
await Summoner.dismiss("Companion");
await Summoner.placeAndSummon(
  actor,
  "Companion",
);
```

Scale a token placed by a cantrip, e.g. "Create Bonfire" from D&D 5E.  Because the spell level is zero, we pass the actor's level as the spell level.  Write the damage formula as `(ceil((@attributes.spellLevel+2)/6))d8` to get an additional die at levels 5, 11 and 17.

```javascript
await Summoner.placeAndSummon(
      actor,
      "Bonfire",
      {
        actorData: { data: { attributes: {
          spellLevel: actor.data.data.details.level,
        }}},
      },
      { setSpellBonuses: true }
    );
```

Summon two tokens in a row using advanced macros

```javascript
await Summoner.placeAndSummon(
  actor,
  "Companion 1",
);
await Summoner.placeAndSummon(
  actor,
  "Companion 2",
);
```

Summon two tokens in a row _without_ advanced macros

```javascript
Summoner.placeAndSummon(
  actor,
  "Companion 1",
).then(() =>
  Summoner.placeAndSummon(
    actor,
    "Companion 2",
  )
);
```

## Notes

* The way that Foundry manages permissions makes it very awkward to control a token for an actor that the player does not own.  We can get around this by doing tricks like setting the actor of the token to the player, but that causes other confusion because the system now thinks the token represents that actor and not the original one.
* The module works by sending a message to the GM through a socket and having the GM create or delete the token.
* There are lots of creative ways to organize things using just actor configuration. It may mean you have to set up a lot of actors, such as multiple instances of the same type for different players, but at least it works! 
* A feature that may help with having tokens for unowned actors is the option to polymorph the token.  For example, there could be a "Bag of Tricks" actor that the player owns, but when the token is summoned it gets polymorphed to the animal that is pulled from the bag.
