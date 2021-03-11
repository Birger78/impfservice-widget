// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: heartbeat;

// author: Birger Stöckelmann 2021 <stoeckelmann@gmail.com>

const baseUrl = 'https://100-iz.impfterminservice.de'
const vaccineListUrl = baseUrl + '/assets/static/its/vaccination-list.json'
const requestSlotUrl = baseUrl + '/rest/suche/termincheck'
const serviceUrl = baseUrl + '/impftermine/service'

const timeFont = Font.boldSystemFont(12)
const titleFont = Font.boldSystemFont(18)
const titleFontB = Font.boldSystemFont(14)
const responseFont = Font.boldSystemFont(10)

const textColor = Color.white()

const dateFormatter = new DateFormatter()
dateFormatter.dateFormat = 'd. MMMM YYYY, HH:mm:ss'

const getData = async (zip) => {
  let lstMs = await new Request(vaccineListUrl).loadJSON()
  let lstMString = lstMs.map(item => item.qualification).join(',')
  const wv = new WebView()
  let url = `${serviceUrl}?plz=${zip}`
  await wv.loadURL(url)
  await wv.evaluateJavaScript('setTimeout(function(){completion(null)}, 3000)', true)
  await wv.loadURL(`${requestSlotUrl}?plz=${zip}&leistungsmerkmale=${lstMString}`)
  let htmlRes = (await wv.getHTML()).replace(/(<([^>]+)>)/gi, '')
  return JSON.parse(htmlRes)
}

const createWidget = async () => {

  let lastCheck = null
  let hasSlots = false
  let storedData = getStoredData()
  let zip = args.widgetParameter || 48155
  let debug = ''

  if (storedData && zip) {
    lastCheck = await getData(zip)
    debug = JSON.stringify(lastCheck)
    hasSlots = lastCheck.termineVorhanden
  }

  let widget = new ListWidget()
  let wide = config.widgetFamily !== 'small'
  if (!wide) {
    widget.setPadding(8, 5, 3, 3)
  }

  widget.backgroundColor = hasSlots ? Color.green() : Color.red()
  widget.url = `${serviceUrl}?plz=${zip}`

  if (hasSlots && !storedData.lastSuccess) {
    let note = new Notification()
    note.title = 'Impftermin-Service'
    note.subtitle = 'Neue Termine verfügbar'
    note.body = `Es sind Termine verfügbar für ${storedData.zip}.`
    note.openURL = `${serviceUrl}?plz=${storedData.zip}`
    note.sound = 'alert'
    let scheduledDate = new Date(new Date().getTime() + 1000)
    note.setTriggerDate(scheduledDate)
    await note.schedule()
    storedData.lastSuccess = true
  }

  storedData.lastSuccess = hasSlots
  setStoredData(storedData)

  // texts
  let stack = widget.addStack()
  stack.layoutVertically()

  if (lastCheck !== null && hasSlots !== undefined) {
    createText(stack, dateFormatter.string(new Date()), timeFont, 5)
    createText(stack, 'Impftermin-Service')
    createText(stack, 'PLZ: ' + storedData.zip, titleFont, 5)
    createText(stack, hasSlots ? 'Termine vorhanden' : 'Keine Termine vorhanden', responseFont, 5)
    if (hasSlots) {
      createText(stack, 'Jetzt Termine buchen!', titleFontB, 0)
    }
  } else {
    createText(stack, 'Verfügbarkeit konnte nicht geprüft werden. ', timeFont)
    createText(stack, 'Antwort: ' + debug, timeFont)
  }

  return widget

}

const createText = (stack, text = '', font = titleFont, spacer = 1, color = textColor, url = null) => {
  let lineStackText = stack.addText(text)
  lineStackText.font = font
  lineStackText.textColor = textColor
  if (url) {
    lineStackText.url = url
  }
  stack.addSpacer(spacer)
}

const setStoredData = storedData => {
  Keychain.set('storedData', JSON.stringify(storedData))
}

const getStoredData = () => {
  return Keychain.contains('storedData') ? JSON.parse(Keychain.get('storedData')) : { lastSuccess: false }
}

const clearStoredData = () => {
  if (Keychain.contains('storedData')) {
    Keychain.remove('storedData')
  }
}

const run = async () => {
  let widget = await createWidget()
  if (config.runsInWidget) {
    Script.setWidget(widget)
    Script.complete()
  } else {
    widget.presentLarge()
  }
}

await run()
