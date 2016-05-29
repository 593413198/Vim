"use strict";

import * as _      from 'lodash';

import { Command, CommandKeyHandler } from './../configuration/commandKeyMap';
import { ModeName, Mode } from './mode';
import { Motion} from './../motion/motion';
import { Position } from './../motion/position';
import { Operator } from './../operator/operator';
import { DeleteOperator } from './../operator/delete';
import { YankOperator } from './../operator/yank';
import { ModeHandler } from './modeHandler.ts';
import { ChangeOperator } from './../operator/change';
import { Actions, BaseAction } from './../actions/actions';

export class VisualMode extends Mode {
    /**
     * The part of the selection that stays in the same place when motions are applied.
     */
    private _selectionStart: Position;

    /**
     * The part of the selection that moves.
     */
    private _selectionStop : Position;
    private _modeHandler   : ModeHandler;

    private _keysToOperators: { [key: string]: Operator };

    constructor(motion: Motion, modeHandler: ModeHandler, keymap: CommandKeyHandler) {
        super(ModeName.Visual, motion, keymap);

        this._modeHandler = modeHandler;
        this._keysToOperators = {
            // TODO: Don't pass in mode handler to DeleteOperators,
            // simply allow the operators to say what mode they transition into.
            'd': new DeleteOperator(modeHandler),
            'x': new DeleteOperator(modeHandler),
            'c': new ChangeOperator(modeHandler),
            'y': new YankOperator(modeHandler),
        };
    }

    shouldBeActivated(key: string, currentMode: ModeName): boolean {
        let command : Command = this._keymap[key];
        return command === Command.EnterVisualMode && currentMode === ModeName.Normal;
    }

    async handleActivation(key: string): Promise<void> {
        this._selectionStart = this.motion.position;
        this._selectionStop  = this._selectionStart;

        this.motion.select(this._selectionStart, this._selectionStop);
    }

    handleDeactivation(): void {
        super.handleDeactivation();

        this.motion.moveTo(this._selectionStop.line, this._selectionStop.character);
    }

    private async _handleMotion(position: Position): Promise<boolean> {
        this._selectionStop = position;
        this.motion.moveTo(this._selectionStart.line, this._selectionStart.character);

        /**
         * Always select the letter that we started visual mode on, no matter
         * if we are in front or behind it. Imagine that we started visual mode
         * with some text like this:
         *
         *   abc|def
         *
         * (The | represents the cursor.) If we now press w, we'll select def,
         * but if we hit b we expect to select abcd, so we need to getRight() on the
         * start of the selection when it precedes where we started visual mode.
         */
        if (this._selectionStart.compareTo(this._selectionStop) <= 0) {
            this.motion.select(this._selectionStart, this._selectionStop);
        } else {
            this.motion.select(this._selectionStart.getRight(), this._selectionStop);
        }

        this._keyHistory = [];

        return true;
    }

    // TODO.

    private async _handleOperator(): Promise<boolean> {
        let keysPressed: string;
        let operator: Operator;

        for (let window = this._keyHistory.length; window > 0; window--) {
            keysPressed = _.takeRight(this._keyHistory, window).join('');

            if (this._keysToOperators[keysPressed] !== undefined) {
                operator = this._keysToOperators[keysPressed];
                break;
            }
        }

        if (operator) {
            if (this._selectionStart.compareTo(this._selectionStop) <= 0) {
                await operator.run(this._selectionStart, this._selectionStop.getRight());
            } else {
                await operator.run(this._selectionStart.getRight(), this._selectionStop);
            }
        }

        return !!operator;
    }

    public async handleAction(action: BaseAction): Promise<void> {
        const result = await action.execAction(this._modeHandler, this.motion.position);

        await this._handleMotion(result);
    }
}
