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

import {AriaTooltipProps} from '@react-types/tooltip';
import {DOMAttributes} from '@react-types/shared';
import {filterDOMProps, mergeProps} from '@react-aria/utils';
import {TooltipTriggerState} from '@react-stately/tooltip';
import {useHover, usePress} from '@react-aria/interactions';

export interface TooltipAria {
  /**
   * Props for the tooltip element.
   */
  tooltipProps: DOMAttributes
}

/**
 * Provides the accessibility implementation for a Tooltip component.
 */
export function useTooltip(props: AriaTooltipProps, state?: TooltipTriggerState): TooltipAria {
  let domProps = filterDOMProps(props, {labelable: true});
  let {pressProps} = usePress({});

  let {hoverProps} = useHover({
    onHoverStart: () => state?.open(true),
    onHoverEnd: () => state?.close()
  });

  return {
    tooltipProps: mergeProps(domProps, hoverProps, pressProps, {
      role: 'tooltip'
    })
  };
}
