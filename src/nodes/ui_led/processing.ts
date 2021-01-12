import nodeRed, { NodeAPI } from 'node-red'
import { BeforeEmitMessage, Emit, InitController, Payload, UiEvents, UITemplateScope } from '../../types/node-red-dashboard'
import { ObserveCallback, WebKitMutationObserver } from './miscellanious'

import { ColorForValueArray } from './shared/types'
import {
  ColorForValueMap,
  ControllerMessage,
  LEDBeforeEmitMessage,
  LEDNode
} from './types'

const getColorForValue = (
  colorForValue: ColorForValueArray | ColorForValueMap,
  value: Payload,
  RED: NodeAPI<nodeRed.NodeAPISettingsWithData>
): [string, boolean] => {
  let color: string | undefined,
    found = false

  try {
    if (Array.isArray(colorForValue)) {
      for (let index = 0; index < colorForValue.length; index++) {
        const compareWith = colorForValue[index]
        
        if (RED.util.compareObjects(compareWith.value, value)) {
          color = compareWith.color
          found = true
          break
        }
      }
    } else if (typeof colorForValue === 'object') {
      color = colorForValue[value]
      found = color !== undefined && color !== null
    }
  } catch (error) {
    console.log("Error trying to find color for value '" + value + "'", error)
  }
  if (found === false || color === undefined) {
    color = 'gray'
  }
  return [color, found]
}

export const beforeEmitFactory = (
  node: LEDNode,
  RED: NodeAPI<nodeRed.NodeAPISettingsWithData>
) => {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    msg: BeforeEmitMessage,
    value: Payload
  ): Emit => {
    if (
      node.allowColorForValueInMessage === true &&
      typeof msg.colorForValue !== 'undefined'
    ) {
      const ledMsg = msg as LEDBeforeEmitMessage
      const msgColorForValue = ledMsg.colorForValue
      if (msgColorForValue !== undefined) {
        node.overrideColorForValue = msgColorForValue
      }
    }
    const colorForValue = node.overrideColorForValue || node.colorForValue

    const [color, glow] = getColorForValue(colorForValue, value, RED)

    return {
      msg: {
        ...msg,
        color,
        glow
      }
    }
  }
}

// TODO: why is initController stringed and evaled??? we have to move erryone into this file :/
export const initController: InitController = ($scope: UITemplateScope, _events: UiEvents): void => {
  $scope.flag = true

  // TODO: From miscellanious.ts, we need to resolve this issue
  const observeDOMFactory = (): ((observe: Document, callback: ObserveCallback) => void) => {
    const MutationObserver = window.MutationObserver || WebKitMutationObserver

    return (
      observe: Document,
      callback: ObserveCallback
    ) => {
      if (!observe || !(observe.nodeType === 1)) {
        return
      }

      if (MutationObserver) {
        const observer = new MutationObserver((mutations, observer) => {
          observer.disconnect()
          callback(mutations)
        })

        observer.observe(observe, {
          childList: true,
          subtree: true
        })
      } else if (window.addEventListener !== undefined) {
        const options = {
          capture: false,
          once: true
        }
        observe.addEventListener('DOMNodeInserted', callback, options)
        observe.addEventListener('DOMNodeRemoved', callback, options)
      }
    }
  }

  const ledStyle = (color: string, glow: boolean) => {
    if (glow) {
      return (
        `background-color: ` +
        color +
        `; box-shadow: inset #ffffff8c 0px 1px 2px, inset #00000033 0 -1px 1px 1px, inset ` +
        color +
        ` 0 -1px 4px, ` +
        color +
        ` 0 0px 12px, ` +
        color +
        ` 0 0px 12px;`
      )
    } else {
      // TODO: duplicate code because of execution scope, fix this shit :|
      return (
        `background-color: ` +
        color +
        `; box-shadow: inset #ffffff8c 0px 1px 2px, inset #00000033 0 -1px 1px 1px, inset ` +
        color +
        ` 0 -1px 4px;`
      )
    }
  }

  const update = (msg: ControllerMessage, element: Element) => {
    if (!msg) {
      return
    }

    if (!element) {
      return
    }

    const color = msg.color
    const glow = msg.glow

    $(element).attr('style', ledStyle(color, glow))
  }

  const retrieveElementFromDocument = (id: string, document: Document) => {
    const elementId = 'led_' + id
    if (!document) {
      return undefined
    }
    return document.getElementById(elementId)
  }

  const observeDOM = observeDOMFactory()

  const updateWithScope = (msg: ControllerMessage) => {
    if (!$scope) {
      return
    }

    const id = $scope.$eval('$id')
    const attemptUpdate = () => {
      const element = retrieveElementFromDocument(id, document)

      if (element) {
        update(msg, element)
      } else {
        // HACK: is there a proper way to wait for this node's element to be rendered?
        observeDOM(document, (_change) => {
          attemptUpdate()
        })
      }
    }
    attemptUpdate()
  }

  $scope.$watch('msg', updateWithScope)
}
