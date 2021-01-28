# foundryvtt-summoner

A module to help with summoning tokens in the Foundry Virtual Tabletop.  It allows players to place and remove select tokens that they control through scripts.  These can be attached to macros to make it easy for players to summon and dismiss their minions.

Additionally, the token data can be overridden on a case-by-case basis to provide customization based on the summoning conditions.

There is also some additional support for common D&D situations.

See the Issues tab to file bug reports and make feature requests.

## Dependencies

While this module does not have any hard dependencies, it can benefit greatly from the [Item Macro](https://foundryvtt.com/packages/itemacro/) and [The Furnace](https://foundryvtt.com/packages/furnace/) modules.  These allow you to replace item usage with macros, which can then summon tokens.

## Setup

Once you have the module installed you will have to set up actors that can be summoned.  The module only allows players to summon actors for tokens that are in a folder called "Summons" and that they have ownership rights to.

## Notes

* The way that Foundry manages permissions makes it very awkward to control a token for an actor that the player does not own.  We can get around this by doing tricks like setting the actor of the token to the player, but that causes other confusion because the system now thinks the token represents that actor and not the original one.
* There are lots of creative ways to organize things using just actor configuration. It may mean you have to set up a lot of actors, such as multiple instances of the same type for different players, but at least it works! 
* A feature that may help with having tokens for unowned actors is the option to polymorph the token.  For example, there could be a "Bag of Tricks" actor that the player owns, but when the token is summoned it gets polymorphed to the animal that is pulled from the bag.
