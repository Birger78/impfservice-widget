// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: heartbeat;

// author: Birger Stöckelmann 2021 <stoeckelmann@gmail.com>

const centerList = 'https://www.impfterminservice.de/assets/static/impfzentren.json'

const timeFont = Font.boldSystemFont(12)
const titleFont = Font.boldSystemFont(18)
const titleFontB = Font.boldSystemFont(14)
const responseFont = Font.boldSystemFont(10)

const textColor = Color.white()

const dateFormatter = new DateFormatter()
dateFormatter.dateFormat = 'd. MMMM YYYY, HH:mm:ss'

const getBaseUrl = async (zip) => {
  // load centers
  let centers = await new Request(centerList).loadJSON()
  for (prop in centers) {
    let center = centers[prop].find(item => Number(item.PLZ) === Number(zip))
    if (center) {
      return center.URL
    }
  }
  return false
}

const getUrls = (baseUrl) => {
  return {
    vaccineListUrl: baseUrl + '/assets/static/its/vaccination-list.json',
    requestSlotUrl: baseUrl + '/rest/suche/termincheck',
    serviceUrl: baseUrl + '/impftermine/service'
  }
}

const getData = async (zip, baseUrl) => {

  let lstMString = ''
  let jsonResponse = {}

  try {

    // load base site
    const wv = new WebView()
    let url = `${getUrls(baseUrl).serviceUrl}?plz=${zip}`
    await wv.loadURL(url)

    // html result parsing
    let html = await wv.getHTML()

    if (html.includes('Not found')) {
      return { state: 'notFound' }
    } else if (html.includes('Wartungsarbeiten')) {// maintenance mode?
      return { state: 'maintenance' }
    } else if (html.includes('Derzeit keine Onlinebuchung von Impfterminen')) {
      return { state: 'offline' }
    } else if (html.includes('Warteraum')) { // virtual waiting room?
      return { state: 'waitingRoom' }
    }

    let lstMs = await new Request(getUrls(baseUrl).vaccineListUrl).loadJSON()
    lstMString = lstMs.map(item => item.qualification).join(',')

    // request slots available
    await wv.evaluateJavaScript('setTimeout(function(){completion(null)}, 3000)', true)
    await wv.loadURL(`${getUrls(baseUrl).requestSlotUrl}?plz=${zip}&leistungsmerkmale=${lstMString}`)
    html = await wv.getHTML()

    // remove tags
    let htmlRes = html.replace(/(<([^>]+)>)/gi, '')

    jsonResponse = { state: 'ok', res: null }
    jsonResponse.res = JSON.parse(htmlRes)

  } catch (e) {
    return { state: 'error', message: e.message }
  }

  return jsonResponse

}

const createWidget = async () => {

  let hasSlots = null
  let storedData = getStoredData()
  let zip = args.widgetParameter

  let baseUrl = await getBaseUrl(zip)
  let dataRes = await getData(zip, baseUrl)

  if (dataRes.state === 'ok' && dataRes.res.hasOwnProperty('termineVorhanden')) {
    hasSlots = dataRes.res.termineVorhanden
  }

  let widget = new ListWidget()
  let wide = config.widgetFamily !== 'small'
  if (!wide) {
    widget.setPadding(8, 5, 3, 3)
  }

  widget.backgroundColor = hasSlots ? Color.green() : Color.red()

  if (['maintenance', 'waitingRoom', 'offline', 'notFound'].includes(dataRes.state)) {
    widget.backgroundColor = Color.orange()
  } else if (dataRes.state === 'error') {
    widget.backgroundColor = Color.red()
  }

  widget.url = `${getUrls(baseUrl).serviceUrl}?plz=${zip}`

  // notification if slots are now available
  if (hasSlots && !storedData.lastSuccess) {
    let note = createNotification(zip, widget.url)
    let scheduledDate = new Date(new Date().getTime() + 1000)
    note.setTriggerDate(scheduledDate)
    await note.schedule()
  }

  storedData.lastSuccess = hasSlots
  setStoredData(storedData)

  // texts
  let stack = widget.addStack()
  stack.layoutVertically()

  createText(stack, dateFormatter.string(new Date()), timeFont, 5)
  createText(stack, 'Impftermin-Service')

  if (dataRes.state === 'notFound') {
    createText(stack, 'Service nicht verfügbar', titleFontB, 5)
  } else if (dataRes.state === 'offline') {
    createText(stack, 'Derzeit keine Online-Buchung', titleFontB, 5)
  } else if (dataRes.state === 'maintenance') {
    createText(stack, 'Wartungsarbeiten', titleFontB, 5)
  } else if (dataRes.state === 'waitingRoom') {
    createText(stack, 'Warteraum', titleFontB, 5)
  } else if (hasSlots !== null) {
    createText(stack, 'PLZ: ' + zip, titleFontB, 5)
    createText(stack, hasSlots ? 'Termine vorhanden' : 'Keine Termine vorhanden', responseFont, 5)
    if (hasSlots) {
      createText(stack, 'Jetzt Termine buchen!', titleFontB, 0)
    }
  } else {
    createText(stack, 'Verfügbarkeit konnte nicht geprüft werden. ', titleFontB, 5)
    createText(stack, 'Antwort: ' + dataRes.state === 'error' ? dataRes.message : JSON.stringify(dataRes), timeFont, 5)
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

const createNotification = (zip, url) => {
  let note = new Notification()
  note.title = 'Impftermin-Service'
  note.subtitle = 'Neue Termine verfügbar'
  note.body = `Es sind Termine verfügbar für ${zip}.`
  note.openURL = url
  note.sound = 'alert'
  return note
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
