#!/usr/bin/env node

doc = `
Usage:
  certificate.js [--time=<time>] [--date=<date>] [--config=<path>] [--output=<path>] <reasons> <profiles>  
  certificate.js -h | --help | --version

Options:
  -h --help         Show this screen.
  --version         Show version.
  --time=<time>     Going out time, foramt: HHhMM
  --date=<date>     Going out date, format: dd/mm/yyyy
  --config=<path>   The path to the config file.
  --output=<path>   The output path of the certificate.

The profiles argument is the path to the json file that contains array of profile.

Possible reasons:
  - travail
  - achats
  - sante
  - famille
  - handicap
  - sport_animaux
  - convocation
  - missions
  - enfants
`

'use strict'

const config = require('config');
const QRCode = require('qrcode')
const PDFLib = require('pdf-lib')
const PDFDocument = PDFLib.PDFDocument
const StandardFonts = PDFLib.StandardFonts
const fs = require('fs')
const {docopt} = require('docopt')
const nodemailer = require('nodemailer')
const path = require('path')

const attestationInputPath = './data/certificate.pdf'


const generateQR = async text => {
  try {
    var opts = {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      quality: 0.92,
      margin: 1,
    }
    return await QRCode.toDataURL(text, opts)
  } catch (err) {
    console.error(err)
  }
}

function pad(str) {
  return String(str).padStart(2, '0')
}

function formatDate(date) {
  year = date.getFullYear()
  month = pad(date.getMonth() + 1) // Les mois commencent à 0
  day = pad(date.getDate())
  return `${day}/${month}/${year}`
}

function formatTime(date) {
  const hour = pad(date.getHours())
  const minute = pad(date.getMinutes())
  return `${hour}h${minute}`
}

function getIdealFontSize (font, text, maxWidth, minSize, defaultSize) {
  let currentSize = defaultSize
  let textWidth = font.widthOfTextAtSize(text, defaultSize)

  while (textWidth > maxWidth && currentSize > minSize) {
    textWidth = font.widthOfTextAtSize(text, --currentSize)
  }

  return textWidth > maxWidth ? null : currentSize
}

const ys = {
  travail: 553,
  achats: 482,
  sante: 434,
  famille: 410,
  handicap: 373,
  sport_animaux: 349,
  convocation: 276,
  missions: 252,
  enfants: 228,
}

async function generatePdf(profile, reasons, pdfBase) {
  const creationInstant = new Date()
  const creationDate = creationInstant.toLocaleDateString('fr-FR')
  const creationDateTitre = creationInstant.getFullYear() + "-" + creationInstant.getMonth() + "-" + creationInstant.getDay()
  const creationHour = creationInstant
      .toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      .replace(':', 'h')
  const creationHourTitre = creationInstant
      .toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      .replace(':', '-')

  const {
    lastname,
    firstname,
    birthday,
    placeofbirth,
    address,
    zipcode,
    city,
    datesortie,
    heuresortie,
  } = profile

  const data = [
    `Cree le: ${creationDate} a ${creationHour}`,
    `Nom: ${lastname}`,
    `Prenom: ${firstname}`,
    `Naissance: ${birthday} a ${placeofbirth}`,
    `Adresse: ${address} ${zipcode} ${city}`,
    `Sortie: ${datesortie} a ${heuresortie}`,
    `Motifs: ${reasons}`,
  ].join(';\n ')

  const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfBase))
  let title = 'attestation-' + creationDateTitre + "_" + creationHourTitre
  pdfDoc.setTitle(title)
  pdfDoc.setSubject('Attestation de déplacement dérogatoire')
  pdfDoc.setKeywords([
    'covid19',
    'covid-19',
    'attestation',
    'déclaration',
    'déplacement',
    'officielle',
    'gouvernement',
  ])
  pdfDoc.setProducer('DNUM/SDIT')
  pdfDoc.setCreator('')
  pdfDoc.setAuthor("Ministère de l'intérieur")

  const page1 = pdfDoc.getPages()[0]

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const drawText = (text, x, y, size = 11) => {
    page1.drawText(text, { x, y, size, font })
  }

  drawText(`${firstname} ${lastname}`, 92, 702)
  drawText(birthday, 92, 684)
  drawText(placeofbirth, 214, 684)
  drawText(`${address} ${zipcode} ${city}`, 104, 665)

  reasons
      .split(', ')
      .forEach(reason => {
        drawText('x', 47, ys[reason], 12)
      })

  let locationSize = getIdealFontSize(font, profile.city, 83, 7, 11)

  if (!locationSize) {
    console.warn('Le nom de la ville risque de ne pas être affiché correctement en raison de sa longueur. ' +
      'Essayez d\'utiliser des abréviations ("Saint" en "St." par exemple) quand cela est possible.')
    locationSize = 7
  }

  drawText(profile.city, 78, 76, locationSize)
  drawText(`${profile.datesortie}`, 63, 58, 11)
  drawText(`${profile.heuresortie}`, 227, 58, 11)

  const generatedQR = await generateQR(data)

  const qrImage = await pdfDoc.embedPng(generatedQR)

  page1.drawImage(qrImage, {
    x: page1.getWidth() - 156,
    y: 25,
    width: 92,
    height: 92,
  })

  pdfDoc.addPage()
  const page2 = pdfDoc.getPages()[1]
  page2.drawImage(qrImage, {
    x: 50,
    y: page2.getHeight() - 390,
    width: 300,
    height: 300,
  })

  return await pdfDoc.save()
}

async function main(arguments) {
  try {
    const now = new Date()
    const todayDate = formatDate(now)
    const nowNow = formatTime(now)

    const profilesFilePath = arguments['<profiles>']

    const profilesData = fs.readFileSync(profilesFilePath)
    const profiles = JSON.parse(profilesData)

    const reasons = arguments['<reasons>'].replace("-", ", ")
    const goingOutDate = arguments['--date'] || todayDate
    const goingOutHour = arguments['--time'] || nowNow

    for (const profile of profiles) {
      profile['datesortie'] = goingOutDate
      profile['heuresortie'] = goingOutHour

      const defaultOutputFilename = `certificate-${profile['lastname']}-${goingOutHour}-${reasons}.pdf`
      const outputPath = path.join(arguments['--output'] || __dirname, defaultOutputFilename) || defaultOutputFilename

      const pdfBlob = await generatePdf(profile, reasons, attestationInputPath)
      fs.writeFileSync(outputPath, pdfBlob)

      console.log(`The certificate is ready: ${outputPath}`)

      if(profile['email']){
        const transporter = nodemailer.createTransport(config.get("Email"));
        const message = {
          from: config.get("Email.auth.user"),
          to: profile['email'],
          subject: 'COVID-19 - Déclaration de déplacement',
          text: 'Attestation de déplacement dérogatoire',
          attachments: [
            {
              path: outputPath,
              contentType: 'application/pdf'
            }
          ]
        };
        await transporter.sendMail(message, function (error, info) {
          if (error) {
            console.log(`Error: ${error}`);
          } else {
            console.log(`The certificate ${outputPath} was send to ${profile['email']}: ${info.response}`)
          }
        });
      }
    }
  } catch (err) {
    console.error('Error', err)
  }
}

var arguments = docopt(doc, {
  version: '0.1.1rc'
})

main(arguments)
