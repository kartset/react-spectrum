/*
 * Copyright 2020 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

// Portions of the code in this file are based on code from react.
// Original licensing for the following can be found in the
// NOTICE file in the root directory of this source tree.
// See https://github.com/facebook/react/tree/cc7c1aece46a6b69b41958d731e0fd27c94bfc6c/packages/react-interactions

import {disableTextSelection, restoreTextSelection} from './textSelection';
import {focusWithoutScrolling, mergeProps, useGlobalListeners, useSyncRef} from '@react-aria/utils';
import {HTMLAttributes, RefObject, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {isVirtualClick} from './utils';
import {PointerType, PressEvents} from '@react-types/shared';
import {PressResponderContext} from './context';

export interface PressProps extends PressEvents {
  /** Whether the target is in a controlled press state (e.g. an overlay it triggers is open). */
  isPressed?: boolean,
  /** Whether the press events should be disabled. */
  isDisabled?: boolean,
  /** Whether the target should not receive focus on press. */
  preventFocusOnPress?: boolean,
  /**
   * Whether press events should be canceled when the pointer leaves the target while pressed.
   * By default, this is `false`, which means if the pointer returns back over the target while
   * still pressed, onPressStart will be fired again. If set to `true`, the press is canceled
   * when the pointer leaves the target and onPressStart will not be fired if the pointer returns.
   */
  shouldCancelOnPointerExit?: boolean,
  /** Whether text selection should be enabled on the pressable element. */
  allowTextSelectionOnPress?: boolean
}

export interface PressHookProps extends PressProps {
  /** A ref to the target element. */
  ref?: RefObject<HTMLElement>
}

interface PressState {
  isPressed: boolean,
  ignoreEmulatedMouseEvents: boolean,
  ignoreClickAfterPress: boolean,
  didFirePressStart: boolean,
  activePointerId: any,
  target: HTMLElement | null,
  isOverTarget: boolean,
  pointerType: PointerType,
  userSelect?: string
}

interface EventBase {
  currentTarget: EventTarget,
  shiftKey: boolean,
  ctrlKey: boolean,
  metaKey: boolean,
  altKey: boolean
}

export interface PressResult {
  /** Whether the target is currently pressed. */
  isPressed: boolean,
  /** Props to spread on the target element. */
  pressProps: HTMLAttributes<HTMLElement>
}

function usePressResponderContext(props: PressHookProps): PressHookProps {
  // Consume context from <PressResponder> and merge with props.
  let context = useContext(PressResponderContext);
  if (context) {
    let {register, ...contextProps} = context;
    props = mergeProps(contextProps, props) as PressHookProps;
    register();
  }
  useSyncRef(context, props.ref);

  return props;
}

/**
 * Handles press interactions across mouse, touch, keyboard, and screen readers.
 * It normalizes behavior across browsers and platforms, and handles many nuances
 * of dealing with pointer and keyboard events.
 */
export function usePress(props: PressHookProps): PressResult {
  let {
    onPress,
    onPressChange,
    onPressStart,
    onPressEnd,
    onPressUp,
    isDisabled,
    isPressed: isPressedProp,
    preventFocusOnPress,
    shouldCancelOnPointerExit,
    allowTextSelectionOnPress,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ref: _, // Removing `ref` from `domProps` because TypeScript is dumb
    ...domProps
  } = usePressResponderContext(props);
  let propsRef = useRef<PressHookProps>(null);
  propsRef.current = {onPress, onPressChange, onPressStart, onPressEnd, onPressUp, isDisabled, shouldCancelOnPointerExit};

  let [isPressed, setPressed] = useState(false);
  let ref = useRef<PressState>({
    isPressed: false,
    ignoreEmulatedMouseEvents: false,
    ignoreClickAfterPress: false,
    didFirePressStart: false,
    activePointerId: null,
    target: null,
    isOverTarget: false,
    pointerType: null
  });

  let {addGlobalListener, removeAllGlobalListeners} = useGlobalListeners();

  let pressProps = useMemo(() => {
    let state = ref.current;
    let triggerPressStart = (originalEvent: EventBase, pointerType: PointerType) => {
      let {onPressStart, onPressChange, isDisabled} = propsRef.current;
      if (isDisabled || state.didFirePressStart) {
        return;
      }

      if (onPressStart) {
        onPressStart({
          type: 'pressstart',
          pointerType,
          target: originalEvent.currentTarget as HTMLElement,
          shiftKey: originalEvent.shiftKey,
          metaKey: originalEvent.metaKey,
          ctrlKey: originalEvent.ctrlKey,
          altKey: originalEvent.altKey
        });
      }

      if (onPressChange) {
        onPressChange(true);
      }

      state.didFirePressStart = true;
      setPressed(true);
    };

    let triggerPressEnd = (originalEvent: EventBase, pointerType: PointerType, wasPressed = true) => {
      let {onPressEnd, onPressChange, onPress, isDisabled} = propsRef.current;
      if (!state.didFirePressStart) {
        return;
      }

      state.ignoreClickAfterPress = true;
      state.didFirePressStart = false;

      if (onPressEnd) {
        onPressEnd({
          type: 'pressend',
          pointerType,
          target: originalEvent.currentTarget as HTMLElement,
          shiftKey: originalEvent.shiftKey,
          metaKey: originalEvent.metaKey,
          ctrlKey: originalEvent.ctrlKey,
          altKey: originalEvent.altKey
        });
      }

      if (onPressChange) {
        onPressChange(false);
      }

      setPressed(false);

      if (onPress && wasPressed && !isDisabled) {
        onPress({
          type: 'press',
          pointerType,
          target: originalEvent.currentTarget as HTMLElement,
          shiftKey: originalEvent.shiftKey,
          metaKey: originalEvent.metaKey,
          ctrlKey: originalEvent.ctrlKey,
          altKey: originalEvent.altKey
        });
      }
    };

    let triggerPressUp = (originalEvent: EventBase, pointerType: PointerType) => {
      let {onPressUp, isDisabled} = propsRef.current;
      if (isDisabled) {
        return;
      }

      if (onPressUp) {
        onPressUp({
          type: 'pressup',
          pointerType,
          target: originalEvent.currentTarget as HTMLElement,
          shiftKey: originalEvent.shiftKey,
          metaKey: originalEvent.metaKey,
          ctrlKey: originalEvent.ctrlKey,
          altKey: originalEvent.altKey
        });
      }
    };

    let cancel = (e: EventBase) => {
      if (state.isPressed) {
        if (state.isOverTarget) {
          triggerPressEnd(createEvent(state.target, e), state.pointerType, false);
        }
        state.isPressed = false;
        state.isOverTarget = false;
        state.activePointerId = null;
        state.pointerType = null;
        removeAllGlobalListeners();
        if (!allowTextSelectionOnPress) {
          restoreTextSelection(state.target);
        }
      }
    };

    let pressProps: HTMLAttributes<HTMLElement> = {
      onKeyDown(e) {
        const {currentTarget, target, nativeEvent, repeat} = e;
        if (currentTarget.contains(target as HTMLElement) && isValidKeyboardEvent(nativeEvent, currentTarget)) {
          e.stopPropagation();
          
          if (shouldPreventDefaultKeyboard(target as Element)) {
            e.preventDefault();
          }
          // If the event is repeating, it may have started on a different element
          // after which focus moved to the current element. Ignore these events and
          // only handle the first key down event.
          if (!state.isPressed && !repeat) {
            state.target = currentTarget as HTMLElement;
            state.isPressed = true;
            triggerPressStart(e, 'keyboard');

            // Focus may move before the key up event, so register the event on the document
            // instead of the same element where the key down event occurred.
            addGlobalListener(document, 'keyup', onKeyUp, false);
          }
        }
      },
      onKeyUp(e) {
        const {currentTarget = state.target, target, nativeEvent, repeat} = e;
        if (
          !repeat &&
          currentTarget.contains(target as HTMLElement) &&
          isValidKeyboardEvent(nativeEvent, currentTarget)
        ) {
          triggerPressUp(createEvent(state.target, e), 'keyboard');
        }
      },
      onClick(e) {
        if (e && !e.currentTarget.contains(e.target as HTMLElement)) {
          return;
        }

        if (e && e.button === 0) {
          e.stopPropagation();
          if (isDisabled) {
            e.preventDefault();
          }

          // If triggered from a screen reader or by using element.click(),
          // trigger as if it were a keyboard click.
          if (!state.ignoreClickAfterPress && !state.ignoreEmulatedMouseEvents && (state.pointerType === 'virtual' || isVirtualClick(e.nativeEvent))) {
            // Ensure the element receives focus (VoiceOver on iOS does not do this)
            if (!isDisabled && !preventFocusOnPress) {
              focusWithoutScrolling(e.currentTarget);
            }

            triggerPressStart(e, 'virtual');
            triggerPressUp(e, 'virtual');
            triggerPressEnd(e, 'virtual');
          }

          state.ignoreEmulatedMouseEvents = false;
          state.ignoreClickAfterPress = false;
        }
      }
    };

    let onKeyUp = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (state.isPressed && isValidKeyboardEvent(e, state.target)) {
        e.stopPropagation();

        if (shouldPreventDefaultKeyboard(target as Element)) {
          e.preventDefault();
        }

        state.isPressed = false;
        triggerPressEnd(createEvent(state.target, e), 'keyboard', state.target.contains(target));
        removeAllGlobalListeners();

        // If the target is a link, trigger the click method to open the URL,
        // but defer triggering pressEnd until onClick event handler.
        if (state.target.contains(target) && isLinkRole(state.target as HTMLElement)) {
          state.target.click();
        }
      }
    };

    if (typeof PointerEvent !== 'undefined') {
      pressProps.onPointerDown = (e) => {
        // Only handle left clicks, and ignore events that bubbled through portals.
        if (e.button !== 0 || !e.currentTarget.contains(e.target as HTMLElement)) {
          return;
        }

        // iOS safari fires pointer events from VoiceOver with incorrect coordinates/target.
        // Ignore and let the onClick handler take care of it instead.
        // https://bugs.webkit.org/show_bug.cgi?id=222627
        // https://bugs.webkit.org/show_bug.cgi?id=223202
        if (isVirtualPointerEvent(e.nativeEvent)) {
          state.pointerType = 'virtual';
          return;
        }

        // Due to browser inconsistencies, especially on mobile browsers, we prevent
        // default on pointer down and handle focusing the pressable element ourselves.
        if (shouldPreventDefault(e.target as Element)) {
          e.preventDefault();
        }

        state.pointerType = e.pointerType;

        e.stopPropagation();
        if (!state.isPressed) {
          state.isPressed = true;
          state.isOverTarget = true;
          state.activePointerId = e.pointerId;
          state.target = e.currentTarget;

          if (!isDisabled && !preventFocusOnPress) {
            focusWithoutScrolling(e.currentTarget);
          }

          if (!allowTextSelectionOnPress) {
            disableTextSelection(state.target);
          }

          triggerPressStart(e, state.pointerType);

          addGlobalListener(document, 'pointermove', onPointerMove, false);
          addGlobalListener(document, 'pointerup', onPointerUp, false);
          addGlobalListener(document, 'pointercancel', onPointerCancel, false);
        }
      };

      pressProps.onMouseDown = (e) => {
        if (!e.currentTarget.contains(e.target as HTMLElement)) {
          return;
        }

        if (e.button === 0) {
          // Chrome and Firefox on touch Windows devices require mouse down events
          // to be canceled in addition to pointer events, or an extra asynchronous
          // focus event will be fired.
          if (shouldPreventDefault(e.target as Element)) {
            e.preventDefault();
          }

          e.stopPropagation();
        }
      };

      pressProps.onPointerUp = (e) => {
        // iOS fires pointerup with zero width and height, so check the pointerType recorded during pointerdown.
        if (!e.currentTarget.contains(e.target as HTMLElement) || state.pointerType === 'virtual') {
          return;
        }

        // Only handle left clicks
        // Safari on iOS sometimes fires pointerup events, even
        // when the touch isn't over the target, so double check.
        if (e.button === 0 && isOverTarget(e, e.currentTarget)) {
          triggerPressUp(e, state.pointerType || e.pointerType);
        }
      };

      // Safari on iOS < 13.2 does not implement pointerenter/pointerleave events correctly.
      // Use pointer move events instead to implement our own hit testing.
      // See https://bugs.webkit.org/show_bug.cgi?id=199803
      let onPointerMove = (e: PointerEvent) => {
        if (e.pointerId !== state.activePointerId) {
          return;
        }

        if (isOverTarget(e, state.target)) {
          if (!state.isOverTarget) {
            state.isOverTarget = true;
            triggerPressStart(createEvent(state.target, e), state.pointerType);
          }
        } else if (state.isOverTarget) {
          state.isOverTarget = false;
          triggerPressEnd(createEvent(state.target, e), state.pointerType, false);
          if (propsRef.current.shouldCancelOnPointerExit) {
            cancel(e);
          }
        }
      };

      let onPointerUp = (e: PointerEvent) => {
        if (e.pointerId === state.activePointerId && state.isPressed && e.button === 0) {
          if (isOverTarget(e, state.target)) {
            triggerPressEnd(createEvent(state.target, e), state.pointerType);
          } else if (state.isOverTarget) {
            triggerPressEnd(createEvent(state.target, e), state.pointerType, false);
          }

          state.isPressed = false;
          state.isOverTarget = false;
          state.activePointerId = null;
          state.pointerType = null;
          removeAllGlobalListeners();
          if (!allowTextSelectionOnPress) {
            restoreTextSelection(state.target);
          }
        }
      };

      let onPointerCancel = (e: PointerEvent) => {
        cancel(e);
      };

      pressProps.onDragStart = (e) => {
        if (!e.currentTarget.contains(e.target as HTMLElement)) {
          return;
        }

        // Safari does not call onPointerCancel when a drag starts, whereas Chrome and Firefox do.
        cancel(e);
      };
    } else {
      pressProps.onMouseDown = (e) => {
        // Only handle left clicks
        if (e.button !== 0 || !e.currentTarget.contains(e.target as HTMLElement)) {
          return;
        }

        // Due to browser inconsistencies, especially on mobile browsers, we prevent
        // default on mouse down and handle focusing the pressable element ourselves.
        if (shouldPreventDefault(e.target as Element)) {
          e.preventDefault();
        }

        e.stopPropagation();
        if (state.ignoreEmulatedMouseEvents) {
          return;
        }

        state.isPressed = true;
        state.isOverTarget = true;
        state.target = e.currentTarget;
        state.pointerType = isVirtualClick(e.nativeEvent) ? 'virtual' : 'mouse';

        if (!isDisabled && !preventFocusOnPress) {
          focusWithoutScrolling(e.currentTarget);
        }

        triggerPressStart(e, state.pointerType);

        addGlobalListener(document, 'mouseup', onMouseUp, false);
      };

      pressProps.onMouseEnter = (e) => {
        if (!e.currentTarget.contains(e.target as HTMLElement)) {
          return;
        }

        e.stopPropagation();
        if (state.isPressed && !state.ignoreEmulatedMouseEvents) {
          state.isOverTarget = true;
          triggerPressStart(e, state.pointerType);
        }
      };

      pressProps.onMouseLeave = (e) => {
        if (!e.currentTarget.contains(e.target as HTMLElement)) {
          return;
        }

        e.stopPropagation();
        if (state.isPressed && !state.ignoreEmulatedMouseEvents) {
          state.isOverTarget = false;
          triggerPressEnd(e, state.pointerType, false);
          if (propsRef.current.shouldCancelOnPointerExit) {
            cancel(e);
          }
        }
      };

      pressProps.onMouseUp = (e) => {
        if (!e.currentTarget.contains(e.target as HTMLElement)) {
          return;
        }

        if (!state.ignoreEmulatedMouseEvents && e.button === 0) {
          triggerPressUp(e, state.pointerType);
        }
      };

      let onMouseUp = (e: MouseEvent) => {
        // Only handle left clicks
        if (e.button !== 0) {
          return;
        }

        state.isPressed = false;
        removeAllGlobalListeners();

        if (state.ignoreEmulatedMouseEvents) {
          state.ignoreEmulatedMouseEvents = false;
          return;
        }

        if (isOverTarget(e, state.target)) {
          triggerPressEnd(createEvent(state.target, e), state.pointerType);
        } else if (state.isOverTarget) {
          triggerPressEnd(createEvent(state.target, e), state.pointerType, false);
        }

        state.isOverTarget = false;
      };

      pressProps.onTouchStart = (e) => {
        if (!e.currentTarget.contains(e.target as HTMLElement)) {
          return;
        }

        e.stopPropagation();
        let touch = getTouchFromEvent(e.nativeEvent);
        if (!touch) {
          return;
        }
        state.activePointerId = touch.identifier;
        state.ignoreEmulatedMouseEvents = true;
        state.isOverTarget = true;
        state.isPressed = true;
        state.target = e.currentTarget;
        state.pointerType = 'touch';

        // Due to browser inconsistencies, especially on mobile browsers, we prevent default
        // on the emulated mouse event and handle focusing the pressable element ourselves.
        if (!isDisabled && !preventFocusOnPress) {
          focusWithoutScrolling(e.currentTarget);
        }

        if (!allowTextSelectionOnPress) {
          disableTextSelection(state.target);
        }

        triggerPressStart(e, state.pointerType);

        addGlobalListener(window, 'scroll', onScroll, true);
      };

      pressProps.onTouchMove = (e) => {
        if (!e.currentTarget.contains(e.target as HTMLElement)) {
          return;
        }

        e.stopPropagation();
        if (!state.isPressed) {
          return;
        }

        let touch = getTouchById(e.nativeEvent, state.activePointerId);
        if (touch && isOverTarget(touch, e.currentTarget)) {
          if (!state.isOverTarget) {
            state.isOverTarget = true;
            triggerPressStart(e, state.pointerType);
          }
        } else if (state.isOverTarget) {
          state.isOverTarget = false;
          triggerPressEnd(e, state.pointerType, false);
          if (propsRef.current.shouldCancelOnPointerExit) {
            cancel(e);
          }
        }
      };

      pressProps.onTouchEnd = (e) => {
        if (!e.currentTarget.contains(e.target as HTMLElement)) {
          return;
        }

        e.stopPropagation();
        if (!state.isPressed) {
          return;
        }

        let touch = getTouchById(e.nativeEvent, state.activePointerId);
        if (touch && isOverTarget(touch, e.currentTarget)) {
          triggerPressUp(e, state.pointerType);
          triggerPressEnd(e, state.pointerType);
        } else if (state.isOverTarget) {
          triggerPressEnd(e, state.pointerType, false);
        }

        state.isPressed = false;
        state.activePointerId = null;
        state.isOverTarget = false;
        state.ignoreEmulatedMouseEvents = true;
        if (!allowTextSelectionOnPress) {
          restoreTextSelection(state.target);
        }
        removeAllGlobalListeners();
      };

      pressProps.onTouchCancel = (e) => {
        if (!e.currentTarget.contains(e.target as HTMLElement)) {
          return;
        }

        e.stopPropagation();
        if (state.isPressed) {
          cancel(e);
        }
      };

      let onScroll = (e: Event) => {
        if (state.isPressed && (e.target as HTMLElement).contains(state.target)) {
          cancel({
            currentTarget: state.target,
            shiftKey: false,
            ctrlKey: false,
            metaKey: false,
            altKey: false
          });
        }
      };

      pressProps.onDragStart = (e) => {
        if (!e.currentTarget.contains(e.target as HTMLElement)) {
          return;
        }

        cancel(e);
      };
    }

    return pressProps;
  }, [addGlobalListener, isDisabled, preventFocusOnPress, removeAllGlobalListeners, allowTextSelectionOnPress]);

  // Remove user-select: none in case component unmounts immediately after pressStart
  // eslint-disable-next-line arrow-body-style
  useEffect(() => {
    let refCurrent = ref.current;
    return () => {
      if (!allowTextSelectionOnPress) {
        restoreTextSelection(refCurrent.target);
      }
    };
  }, [allowTextSelectionOnPress]);

  return {
    isPressed: isPressedProp || isPressed,
    pressProps: mergeProps(domProps, pressProps)
  };
}

function isEditableText(event: KeyboardEvent):boolean {
  const {tagName, isContentEditable} = event.target as HTMLElement;
  return (tagName === 'INPUT' || tagName === 'TEXTAREA' || isContentEditable === true);
}

function isEnterKey(event: KeyboardEvent):boolean {
  return event.key === 'Enter';
}

function isSpaceKey(event: KeyboardEvent):boolean {
  const {key, code} = event;
  return key === ' ' || key === 'Spacebar' || code === 'Space';
}

function isHTMLAnchorLink(target: HTMLElement): boolean {
  return target.tagName === 'A' && target.hasAttribute('href');
}

function isLinkRole(target: HTMLElement): boolean {
  return isHTMLAnchorLink(target) || target.getAttribute('role') === 'link';
}

function isValidKeyboardEvent(event: KeyboardEvent, currentTarget?: EventTarget): boolean {
  const {target} = event;
  const element = target as HTMLElement;
  const currentTargetElement = currentTarget as HTMLElement;
  const role = element.getAttribute('role');
  const isEnter = isEnterKey(event);

  // Accessibility for keyboards. Space and Enter only.
  // "Spacebar" is for IE 11
  return (
    (isEnter || isSpaceKey(event)) &&
    (
      (
        !isEditableText(event) &&
        (
          // A link with a valid href should be handled natively,
          !isHTMLAnchorLink(element) || 
          // unless it also has role='button' and was triggered using Space.
          (role === 'button' && !isEnter)
        ) &&
        // An element with role='link' should only trigger with Enter key.
        !(role === 'link' && !isEnter)
      ) ||
      (
        // If the target is a link, but the currentTarget containing it is something else, 
        // like a table row, treat the space key as a valid keyboard event as well.
        currentTargetElement &&
        currentTargetElement !== element &&
        currentTargetElement.contains(currentTargetElement as HTMLElement) && 
        isLinkRole(element) &&
        !isEnter
      )
    )
  );
}

function getTouchFromEvent(event: TouchEvent): Touch | null {
  const {targetTouches} = event;
  if (targetTouches.length > 0) {
    return targetTouches[0];
  }
  return null;
}

function getTouchById(
  event: TouchEvent,
  pointerId: null | number
): null | Touch {
  const changedTouches = event.changedTouches;
  for (let i = 0; i < changedTouches.length; i++) {
    const touch = changedTouches[i];
    if (touch.identifier === pointerId) {
      return touch;
    }
  }
  return null;
}

function createEvent(target: HTMLElement, e: EventBase): EventBase {
  return {
    currentTarget: target,
    shiftKey: e.shiftKey,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    altKey: e.altKey
  };
}

interface Rect {
  top: number,
  right: number,
  bottom: number,
  left: number
}

interface EventPoint {
  clientX: number,
  clientY: number,
  width?: number,
  height?: number,
  radiusX?: number,
  radiusY?: number
}

function getPointClientRect(point: EventPoint): Rect {
  let offsetX = (point.width / 2) || point.radiusX || 0;
  let offsetY = (point.height / 2) || point.radiusY || 0;

  return {
    top: point.clientY - offsetY,
    right: point.clientX + offsetX,
    bottom: point.clientY + offsetY,
    left: point.clientX - offsetX
  };
}

function areRectanglesOverlapping(a: Rect, b: Rect) {
  // check if they cannot overlap on x axis
  if (a.left > b.right || b.left > a.right) {
    return false;
  }
  // check if they cannot overlap on y axis
  if (a.top > b.bottom || b.top > a.bottom) {
    return false;
  }
  return true;
}

function isOverTarget(point: EventPoint, target: HTMLElement) {
  let rect = target.getBoundingClientRect();
  let pointRect = getPointClientRect(point);
  return areRectanglesOverlapping(rect, pointRect);
}

function shouldPreventDefault(target: Element) {
  // We cannot prevent default if the target is inside a draggable element.
  return !target.closest('[draggable="true"]');
}

function shouldPreventDefaultKeyboard(target: Element) {
  return !((target.tagName === 'INPUT' || target.tagName === 'BUTTON') && (target as HTMLButtonElement | HTMLInputElement).type === 'submit');
}

function isVirtualPointerEvent(event: PointerEvent) {
  // If the pointer size is zero, then we assume it's from a screen reader.
  // Android TalkBack double tap will sometimes return a event with width and height of 1
  // and pointerType === 'mouse' so we need to check for a specific combination of event attributes.
  // Cannot use "event.pressure === 0" as the sole check due to Safari pointer events always returning pressure === 0
  // instead of .5, see https://bugs.webkit.org/show_bug.cgi?id=206216
  return (
    (event.width === 0 && event.height === 0) ||
    (event.width === 1 &&
      event.height === 1 &&
      event.pressure === 0 &&
      event.detail === 0
    )
  );
}
