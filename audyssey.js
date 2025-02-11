// INITIALISATION
const ocaTypeId = "OCAFILE", ocaVersion = 1, evoVersion = "preview1.6", ifVersionMajor = 10, ifVersionMinor = 5;
const baseUrl = 'http://localhost:4735/measurements', speedDelay = 255;
let micCalFile = new Array(16384).fill(0), audioCtx = null;
let jsonName, jsonType, jsonContent = null, folderPath;
let sOs = null, isCirrusLogic, isSoftRoll, freqIndex = [], distFL = null, modelDelayLimit, minDistAccuracy, mSec = [], hardNegative, hardPositive, xt32 = true, xt = false;
let nSpeakers = null, nSubs = null, subMinTrim = -12, subMaxTrim = 12, lpf4LFE;
let targetCurvePath, targetLevel, responseTarget, dataTarget, tcName, rewMaxLimit;
let customLevel = [], commandId = [], customDistance = [], customInvert = [], customCrossover = [], customFilter = [], isLarge = [], subLPF = [], subTrim = [], LFE = true;
// CUSTOMIZATION
var maxBoost, bassFill, softRoll, disableInversion, forceLarge, sameXover;
// EXECUTION
async function main(){
  const logContainer = document.getElementById('logContainer');
  const measurementChoice = document.getElementById('measurementChoice');
  logContainer.style.display = 'block';
  measurementChoice.classList.add('transitioned');
  const startTime = performance.now();
  await checkREW();
  await clearCommands();
  await updateAPI('blocking', true);
  await updateAPI('inhibit-graph-updates', true);
  const isAutomated = await checkOrigin();
  const isPreProcessed = await checkPrePro();
  isAutomated ? console.log("<< Optimizing using 'automated' measurements with 16k samples >>") : console.log("<< Optimizing using 'manual REW' measurements with 256k samples >>");
  if (isPreProcessed) console.log('<< Using previously processed and saved measurements >>')
  await (isPreProcessed ? checkRewMeasurements() : (isAutomated ? checkAutomatedMeasurements() : checkRewMeasurements()));
  await resetAll();
  if (!isAutomated && !isPreProcessed) await fixSubs4REW();
  await ocAced();
  await setVolumeLevels();
  await optimizeSubVolume();
  await getXovers();
  let {filteredSpeaker, indices} = await alignSub();
  await calculateLargeSpeaker();
  await generateResults(filteredSpeaker, indices);
  await generateOCA();
  const endTime = performance.now();
  const totalTime = (endTime - startTime) / 1000;
  const formatTime = (seconds) => {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.round(seconds % 60);
      if (minutes === 0) {
          return `${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
      } else if (remainingSeconds === 0) {
          return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
      } else {
          return `${minutes} minute${minutes !== 1 ? 's' : ''} and ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
      }};
  const getCurrentDateTime = () => {
      const now = new Date();
      return now.toLocaleString('en-US', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
      });};
  console.log(`'A1 Evo Neuron' completed optimization of your system in ${formatTime(totalTime)} on ${getCurrentDateTime()}.`);
  console.log(`Save generated calibration file '.oca' in ${folderPath} when prompted`);
  console.log(`You can transfer optimized configuration to your receiver using the menu in 'odd.wtf Menu.bat' which you will find in the same folder`);
  console.warn(`Models with multiple presets: the transferred calibration will be sent to the receiver's currently selected preset!`);
  console.info(`Enjoy your 'Evo'lved sound!`);
  await updateAPI('blocking', false);
  await updateAPI('inhibit-graph-updates', false);
  await promptSaveLog();}
async function ocAced() {
 const allowedNames = ['FL','FR','C','SLA','SRA','SBL','SBR','SB','FHL','FHR','FWL','FWR','TFL','TFR','TML','TMR','TRL','TRR','RHL','RHR','FDL','FDR','SDL','SDR','BDL','BDR','SHL','SHR','TS','CH','SW1','SW2','SW3','SW4'];
  function extractBaseName(title) {
    let bestMatch = null;
    let bestMatchLength = 0;
    for (const name of allowedNames) {
      if (title.startsWith(name) && name.length > bestMatchLength) {
        bestMatch = name;
        bestMatchLength = name.length;
      }
    }
    return bestMatch !== null ? bestMatch : title;
  }
  let allResponses = await fetchREW();
  let measurementArray = Object.keys(allResponses).map(key => ({
    index: parseInt(key, 10),
    title: allResponses[key].title,
  }));
  let currentGroup = [measurementArray[0].index];
  let currentPrefix = extractBaseName(measurementArray[0].title);
  let isSubwooferGroup = currentPrefix.startsWith('SW');
  let hasMultipleMeasurements = false;
  let anyMultipleMeasurements = false;
  for (let i = 1; i < measurementArray.length; i++) {
    const {index, title} = measurementArray[i];
    const prefix = extractBaseName(title);
    const isCurrentSubwooferGroup = prefix.startsWith('SW');
    if (prefix !== currentPrefix) {
      if (!isSubwooferGroup && currentGroup.length > 1) {
        if (!hasMultipleMeasurements) {
          console.info(`Performing IDW analysis on speaker measurements based on mic position proximity to MLP...`);
          hasMultipleMeasurements = true;
        }
        anyMultipleMeasurements = true;
        await syncPeaks(currentGroup, currentPrefix);
      }
      await getSpatial(currentGroup, currentPrefix);
      currentGroup = [index];
      currentPrefix = prefix;
      isSubwooferGroup = isCurrentSubwooferGroup;
    } else {
      currentGroup.push(index);
    }
  }
  if (currentGroup.length > 0) {
    if (!isSubwooferGroup && currentGroup.length > 1) {
      await syncPeaks(currentGroup, currentPrefix);
    }
    await getSpatial(currentGroup, currentPrefix);
  }
  console.info(`Clean up in progress...`);
  for (let i = measurementArray.length; i > 0; i--) {
    await postDelete(i);
  };
  if (anyMultipleMeasurements) {
    await putSafe(`${baseUrl}/1`, {notes: 'pre-processsed measurement'},'Update processed');
    const modalHtml = `
      <dialog style="
        /* Match #logContainer's look */
        background: linear-gradient(135deg, #2D3748, #4A5568);
        padding: 20px;
        border-radius: 10px;
        border: none;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        max-width: 800px;
        font-family: 'Poppins', 'Segoe UI', Roboto, sans-serif;
        font-size: 0.8rem;
        color: #E2E8F0;
        z-index: 3000; 
      ">
        <form method="dialog" style="margin: 0;">
          <h3 style="
            margin: 0 0 15px 0; 
            font-size: 1.5rem; 
            font-weight: bold; 
            color: #E2E8F0;
          ">
            Save Progress?
          </h3>
          <p style="
            margin-bottom: 20px; 
            line-height: 1.6; 
            color: #E2E8F0;
          ">
            Multiple microphone positions were processed. Would you like to save the current state to avoid redundant processing in future optimization runs? REW file 
            <strong>'Pre-processed_Measurements_[timestamp].mdat'</strong> 
            will be saved in the 'A1 Evo Neuron' folder.
          </p>
          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <!-- Cancel Button -->
            <button type="submit" value="cancel" style="
              padding: 10px 20px; 
              border: none; 
              border-radius: 6px; 
              background: #4A5568; 
              color: #E2E8F0; 
              font-size: 0.8rem; 
              cursor: pointer; 
              transition: background 0.2s ease;
            ">
              Cancel
            </button>
            <!-- Save Button -->
            <button type="submit" value="confirm" style="
              padding: 10px 20px; 
              border: none; 
              border-radius: 6px; 
              background: #2B6CB0; 
              color: #E2E8F0; 
              font-size: 0.8rem; 
              font-weight: bold; 
              cursor: pointer; 
              transition: background 0.2s ease;
            ">
              Save
            </button>
          </div>
        </form>
      </dialog>
    `;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = modalHtml;
    const dialog = wrapper.querySelector('dialog');
    const styleElem = document.createElement('style');
    styleElem.innerHTML = `
      dialog::backdrop {
        background: rgba(0, 0, 0, 0.6); 
        backdrop-filter: blur(2px);
      }
    `;
    document.head.appendChild(styleElem);
    document.body.appendChild(dialog);
    dialog.showModal();
    const result = await new Promise(resolve => {
      dialog.addEventListener('close', () => {
        const returnValue = dialog.returnValue;
        resolve(returnValue === 'confirm');
        dialog.remove();
      });
    });
    if (result) {
      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
      const fileName = `Pre-processedMeasurements_${timestamp}.mdat`;
      const fullPath = `${folderPath}/${fileName}`;
      await postSafe(
        `http://localhost:4735/measurements/command`,
        {command: 'Save all', parameters: [fullPath]},
        `Saved all measurements`
      );
      console.log(`File saved as: ${fileName}`);
    } else {
      console.log('User chose not to save progress.');
    }
  }
  allResponses = await fetchREW();
  measurementArray = Object.keys(allResponses).map(key => ({
    index: parseInt(key),
    title: allResponses[key].title
  }));
  let allSpeakers = Object.keys(allResponses)
    .filter(key => !allResponses[key].title.startsWith("SW"))
    .map(key => parseInt(key));
  nSpeakers = allSpeakers.length;
  let allSubs = Object.keys(allResponses)
    .filter(key => allResponses[key].title.startsWith("SW"))
    .map(key => parseInt(key));
  nSubs = allSubs.length;
  for (let i = 1; i <= nSpeakers + nSubs; i++){
    const readName = await fetchREW(i);
    const name = readName.title;
    commandId[i] = name.slice(0, -1);
    customCrossover[i] = null;
  }
  const detectedChannelIds = jsonContent.detectedChannels.map(channel => channel.commandId);
  commandId.forEach((id, index) => {
    if (!detectedChannelIds.includes(id)) {
      console.error(`${id} is missing in configuration file!`);
      throwError();
    }
  });
  detectedChannelIds.forEach((id, index) => {
    if (!commandId.includes(id)) {
      console.error(`Channel "${id}" in the uploaded configuration file is missing in REW. Please ensure that the channels are correctly configured in the receiver's 'Speaker Configuration' menu before generating the '.avr' file.`);
      throwError();
    }
  });
  await checkPolarity();
  await checkLFE(allSubs);
  await syncPeaks(allSpeakers);
  allResponses = await fetchREW();
  allSpeakers.forEach(i => mSec[i] = +allResponses[i].cumulativeIRShiftSeconds);
  let [maxM, minM] = [Math.max(...mSec.slice(1)), Math.min(...mSec.slice(1))];
  modelDelayLimit = 7.35 / sOs * 1000;
  [hardPositive, hardNegative] = [minM * 1000 + modelDelayLimit, maxM * 1000 - modelDelayLimit];
  if (hardNegative > 0 || hardPositive < 0) {
   console.error(`It's not possible to sync your speakers at the MLP with the available hardware limits of your AVR. You'll need to move these speakers closer and repeat measurements!`);
   throwError();
  }
  allSubs.forEach(i => mSec[i] = +allResponses[i].cumulativeIRShiftSeconds);
  if (nSubs > 1) {
     await multipleSubs(allSubs);
     let [maxSubM, minSubM] = [Math.max(...allSubs.map(i => mSec[i])) * 1000, Math.min(...allSubs.map(i => mSec[i])) * 1000];
     [hardPositive, hardNegative] = [Math.max(hardPositive - maxSubM, hardNegative - minSubM + modelDelayLimit), Math.min(hardNegative - minSubM, hardPositive - maxSubM - modelDelayLimit)];
     if (hardNegative > hardPositive) {
      console.error(`Unfortunately, there's no hardware limit left to align your combined subwoofer response with the rest of the speakers! Optimization cannot continue.`);
      throwError();
     }
  } else {
     customInvert[nSpeakers + 1] = false;
  }}
async function syncPeaks(indices, name = null) {
  await postNext('Cross corr align', indices);
  await new Promise((resolve) => setTimeout(resolve, speedDelay));
  const response0 = await fetchREW(indices[0]);
  const irStart0 = response0.timeOfIRStartSeconds;
  for (let j = 1; j < indices.length; j++) {
    const ccResponse = await fetchREW(indices[j]);
    const irStartDiff = Math.abs(ccResponse.timeOfIRStartSeconds - irStart0);
    if (irStartDiff > minDistAccuracy) {
      const check = await magicAlign(indices[0], indices[j]);
      if (!check) {continue;}
      const secondTry = await fetchREW(indices[j]);
      const irStartDiff2 = secondTry.timeOfIRStartSeconds - irStart0;
      if (Math.abs(irStartDiff2) > minDistAccuracy && check) {
        if (name) {
          console.warn(`${name}${j} required several additional attempts to be properly aligned to MLP due to strong HF reflection content in its IR!`)
          await new Promise((resolve) => setTimeout(resolve, speedDelay));
        }
          else {
            const whatName = await fetchREW(j + 1);
            const title = whatName.title;
            console.warn(`${title} required several additional attempts to be properly aligned to MLP due to strong HF reflection content in its IR!`)
            await new Promise((resolve) => setTimeout(resolve, speedDelay));
          }
      }
    }
  }
  async function magicAlign(index0, index1) {
    let magicShift = await getDivisionPeakTime(index0, index1);
    if (Math.abs(magicShift) > minDistAccuracy) {
      await postNext('Offset t=0', index1, {offset: magicShift, unit: "seconds"});
      return true;
    }
    return false;
    async function getDivisionPeakTime(i0, i1) {
      const division = await postNext('Arithmetic', [i1, i0], {function: "A / B"});
      await new Promise((resolve) => setTimeout(resolve, speedDelay));
      const key = parseInt(Object.keys(division.results)[0], 10);
      const peakIR = await findTruePeak(key);
      await postDelete(key);
      return peakIR;
    }
  }}
async function findTruePeak(key) {
  const ep = await postNext('Excess phase version', key, {
    "include cal": true,
    "append lf tail": false,
    "append hf tail": false,
    "frequency warping": false,
    "replicate data": false
  });
  await new Promise((resolve) => setTimeout(resolve, speedDelay));
  const keyEP = parseInt(Object.keys(ep.results)[0]);
  const response = await fetchSafe('impulse-response?normalised=true', keyEP);
  await postDelete(keyEP);
  const startTime = response.startTime;
  const sampleRate = response.sampleRate;
  const bytes = Uint8Array.from(atob(response.data), c => c.charCodeAt(0));
  const dataView = new DataView(bytes.buffer);
  const totalSamples = bytes.length / 4;
  let maxPeak = 0;
  let maxPosition = 0;
  for (let i = 1; i < totalSamples - 1; i++) {
    const prev = dataView.getFloat32((i - 1) * 4, false);
    const curr = dataView.getFloat32(i * 4, false);
    const next = dataView.getFloat32((i + 1) * 4, false);
    if ((curr > prev && curr > next) || (curr < prev && curr < next)) {
      for (let j = 0; j < 16; j++) {
        const position = i + j / 16;
        const center = Math.floor(position);
        let interpolatedValue = 0;
        for (let k = center - 8; k <= center + 8; k++) {
          if (k >= 0 && k < totalSamples) {
            const x = position - k;
            const sampleValue = dataView.getFloat32(k * 4, false);
            if (x === 0) {
              interpolatedValue += sampleValue;
            } else if (Math.abs(x) <= 8) {
              const px = Math.PI * x;
              const sinc = Math.sin(px) / px;
              const window = 0.5 * (1 - Math.cos(2 * Math.PI * (x / 16)));
              interpolatedValue += sampleValue * sinc * window;
            }
          }
        }
        if (Math.abs(interpolatedValue) > Math.abs(maxPeak)) {
          maxPeak = interpolatedValue;
          maxPosition = position;
        }
      }
    }
  }
  return startTime + maxPosition / sampleRate;}
async function getSpatial(indices, name) {
  const powerFactor = 1.61803398874989; //Adjusts number of speaker averages for IDW - increase for more averages
  if (indices.length === 1) {
    await postSafe(`${baseUrl}/${indices[0]}/command`, {command: 'Response copy'}, 'Completed');
    const allResponses = await fetchREW();
    const nTotal = Object.keys(allResponses).length;
    await fetchREW(nTotal, 'PUT', {title: name + "o"});
    return
  }
  if (name.startsWith("SW")) {
    const vectorAverage = await postNext('Vector average', indices);
    await new Promise((resolve) => setTimeout(resolve, speedDelay));
    const vectorKey = Object.keys(vectorAverage.results)[0];
    const key = parseInt(vectorKey, 10);
    await fetchREW(key, 'PUT', {title: name + "o"});
    console.info(`Total measurements averaged to optimize speaker ${name} steady state response: ${indices.length}`);
    return;
  };
  console.info(`Analysing speaker ${name} measurements...`);
    const count = indices.length;
    const distances = new Array(count);
    const revertDistances = new Array(count);
    const weights = new Array(count);
    for (let i = 0; i < count; i++) {
      const measurement = await fetchREW(indices[i]);
      distances[i] = parseFloat(measurement.cumulativeIRShiftSeconds);
    }
  const mlpShift = distances[0];
  for (let i = 0; i < count; i++) {
    distances[i] = Math.abs(distances[i] - mlpShift);
  }
  const maxDistance = Math.max(...distances);
  const avrgDistance = math.mean(distances);
  if (maxDistance * 34300 < 1) {
    console.info(`Clocking deviations detected among same mic position repeat measurements (±${(maxDistance * 34300).toFixed(2)}cm)`)
    for (let i = 0; i < count; i++) {
      await postNext('Offset t=0', indices[i], {offset: -avrgDistance, unit: 'seconds'});
    }
    console.info(`Measurements were shifted ${(avrgDistance * 34300).toFixed(2)}cm to compensate`)
    const vectorAverage = await postNext('Vector average', indices);
    await new Promise((resolve) => setTimeout(resolve, speedDelay));
    const vectorKey = Object.keys(vectorAverage.results)[0];
    const key = parseInt(vectorKey, 10);
    await fetchREW(key, 'PUT', {title: name + "o"});
    console.info(`Total measurements averaged: ${indices.length}`);
    return;
  }
  const maxCopies = Math.round(indices.length * powerFactor / 2);
  weights[0] = maxCopies;
  for (let i = 1; i < count; i++) {
    const normalizedDistance = distances[i] / maxDistance;
    weights[i] = Math.max(1, Math.round(maxCopies * Math.pow(1 - normalizedDistance, powerFactor)));
  }
  const allResponses = await fetchREW();
  const nTotal = Object.keys(allResponses).length;
  x = 1;
  const newIndices = [];
  indices.forEach((idx, i) => {
    for (let j = 0; j < weights[i]; j++) {
      newIndices.push(idx);
      x++;
    }
  });
  console.info(`Maximum detected distance: ${(maxDistance * 34300).toFixed(2)}cm, applied power factor: ${powerFactor.toFixed(2)}, total copies averaged: ${x - 1}`);
  indices.forEach((idx, i) => {
    weights[i] > 1 ? console.info(`  Position ${idx - indices[0]}${idx === indices[0] ? " (MLP)" : ""}: ${weights[i]} copies (distance: ${(distances[i] * 34300).toFixed(2)}cm)`) :
      console.info(`  Position ${idx - indices[0]}${idx === indices[0] ? " (MLP)" : ""}: ${weights[i]} copy (distance: ${(distances[i] * 34300).toFixed(2)}cm)`);
  });
  const vectorAverage = await postNext('Vector average', newIndices);
  await new Promise((resolve) => setTimeout(resolve, speedDelay));
  const vectorKey = Object.keys(vectorAverage.results)[0];
  const key = parseInt(vectorKey, 10);
  await fetchREW(key, 'PUT', {title: name + "o"});}
async function checkPolarity() {
  function calculateCorrelation(arrayX, arrayY) {
    const n = arrayX.length;
    const meanX = arrayX.reduce((sum, x) => sum + x, 0) / n;
    const meanY = arrayY.reduce((sum, y) => sum + y, 0) / n;
    let numerator = 0;
    let denomX = 0;
    let denomY = 0;
    for (let i = 0; i < n; i++) {
      const diffX = arrayX[i] - meanX;
      const diffY = arrayY[i] - meanY;
      numerator += diffX * diffY;
      denomX += diffX ** 2;
      denomY += diffY ** 2;
    }
    const denominator = Math.sqrt(denomX * denomY);
    return numerator / denominator;}
  const peakTimeFL = await findTruePeak(1);
  const signFL = await peakSign(1, peakTimeFL);
  const phaseFL = await getPhase(1, 0);
  let corr = [], corrInv = [];
  customInvert[1] = false;
  console.log(`Checking polarities in reference to speaker ${commandId[1]} >>`)
  console.warn(`Polarity checks may report false positives with faulty measurements, external amp setups, dipoles and dolby-enabled speakers. If you're certian all is correct, disable polarity inversion option before starting optimization.`);
  for (let i = 2; i <= nSpeakers; i++) {
    customInvert[i] = false;
    const peakTimeN = await findTruePeak(i);
    const signN = await peakSign(i, peakTimeN);
    const phaseN = await getPhase(i, peakTimeN - peakTimeFL);
    corr[i] = calculateCorrelation(phaseFL, phaseN);
    await postSafe(`${baseUrl}/${i}/command`, {command: "Invert"}, "Invert completed");
    const INVpeakTimeN = await findTruePeak(i);
    const phaseInv = await getPhase(i, INVpeakTimeN - peakTimeFL);
    corrInv[i] = calculateCorrelation(phaseFL, phaseInv);
    if (corr[i] < corrInv[i] && signFL !== signN) {
      console.warn(`Speaker ${commandId[i]} seems to be out of phase!`);
      if (!disableInversion) {
        customInvert[i] = true;
        console.warn(`Speaker ${commandId[i]} will be automatically INVERTED! Please DO NOT swap speaker cables!`);
      } else {
        await postSafe(`${baseUrl}/${i}/command`, { command: "Invert" }, "Invert completed");
        console.warn(`Speaker inversion option has been disabled! Neuron will leave polarity of speaker ${commandId[i]} unchanged!`);
      }
    } else {
      console.log(`Speaker ${commandId[i]} ✓`);
      await postSafe(`${baseUrl}/${i}/command`, { command: "Invert" }, "Invert completed");
      customInvert[i] = false;
    }
  }}
async function getPhase(index, shift) {
  await postNext('Offset t=0', index, {offset: shift, unit: "seconds"});
  const response = await fetchSafe('frequency-response?smoothing=1%2F1&ppo=96', index);
  await postNext('Offset t=0', index, {offset: -shift, unit: "seconds"});
  const {startFreq, ppo, phase} = response;
  const bytes = Uint8Array.from(atob(phase), c => c.charCodeAt(0));
  const data = new DataView(bytes.buffer);
  const phaseArray = Array.from({ length: bytes.length / 4 }, (_, k) => data.getFloat32(k * 4, false));
  const frequencies = Array.from(
    {length: phaseArray.length},
    (_, i) => startFreq * Math.pow(2, i / ppo)
  );
  return phaseArray.filter((_, i) => frequencies[i] >= 20 && frequencies[i] <= 20000);}
async function peakSign(index, peakTime) {
  const response   = await fetchSafe('impulse-response', index);
  const startTime  = response.startTime;
  const sampleRate = response.sampleRate;
  const bytes     = Uint8Array.from(atob(response.data), c => c.charCodeAt(0));
  const dataView  = new DataView(bytes.buffer);
  const totalSamples = bytes.length / 4;
  let sampleIndex = Math.round((peakTime - startTime) * sampleRate);
  if (sampleIndex < 0) sampleIndex = 0;
  if (sampleIndex >= totalSamples) sampleIndex = totalSamples - 1;
  const value = dataView.getFloat32(sampleIndex * 4, false);
  return value > 0 ? 1 : -1;}
async function checkLFE(subIndices) {
  console.info(`\nConducting initial evaluation for ${nSubs} subwoofer${nSubs === 1 ? '' : 's'}...`);
  if (subIndices.length === 1) subIndices.push(subIndices[0]);
  await postNext('Smooth', subIndices, {smoothing: "Psy"});
  await new Promise(resolve => setTimeout(resolve, speedDelay));
  const subShift = await postNext('Align SPL', subIndices, {
      "frequencyHz": `48.989795`,
      "spanOctaves": `2.5849625`,
      "targetdB": "average"
  });
  if (subIndices[0] != subIndices[1]) {
    let maxBoost = -Infinity, minBoost = Infinity;
    for (const [i, subIndex] of subIndices.entries()) {
      const delta = parseFloat(subShift.results[subIndex].alignSPLOffsetdB);
      const deltaRounded = Math.round(delta * 2) / 2;
      if (Math.abs(deltaRounded) > 12) {
        console.error(`Required 'relative' volume alignment for SW${i + 1} is beyond hardware limits!`);
        throwError();
      }
      subTrim[i + 1] = deltaRounded;
      maxBoost = Math.max(maxBoost, deltaRounded);
      minBoost = Math.min(minBoost, deltaRounded);
      console.log(`SW${i + 1} applied 'relative' volume adjustment: ${deltaRounded}dB`);
      await postNext('Add SPL offset', subIndex, {offset: deltaRounded - delta});
    }
    subMaxTrim -= maxBoost;
    subMinTrim -= minBoost;
  }
  const rmsAverage = await postNext('Magn plus phase average', subIndices);
  await new Promise((resolve) => setTimeout(resolve, speedDelay));
  const keyAverage = parseInt(Object.keys(rmsAverage.results)[0], 10);
  await postSafe(`${baseUrl}/${keyAverage}/target-settings`, {shape: "None"}, "Update processed");
  await postSafe(`http://localhost:4735/eq/house-curve`, targetCurvePath, "House curve set");
  await postSafe(`${baseUrl}/${keyAverage}/room-curve-settings`, {addRoomCurve: false}, "Update processed");
  await postNext('Generate target measurement', keyAverage);
  await postSafe(`${baseUrl}/${keyAverage + 1}/filters`, {
    filters: [{
      index: 21, type: "Low pass", enabled: true, isAuto: false,
      frequency: 120, shape: "L-R", slopedBPerOctave: 24
    }]
  }, "Filters set");
  await new Promise(resolve => setTimeout(resolve, speedDelay));
  const tResponse = await fetchSafe(`${keyAverage + 1}/eq/frequency-response?smoothing=1%2F1&ppo=96`);
  const tData = new DataView(Uint8Array.from(atob(tResponse.magnitude), c => c.charCodeAt(0)).buffer);
  let bestFreq = null;
  let bestDiff = Infinity;
  for (const freq of freqIndex.slice(6)) {
    await postSafe(`${baseUrl}/${keyAverage}/filters`, {
      filters: [{
        index: 21, type: "Low pass", enabled: true, isAuto: false,
        frequency: freq, shape: "L-R", slopedBPerOctave: 24
      }]
    }, "Filters set");
    await new Promise(resolve => setTimeout(resolve, speedDelay));
    const sResponse = await fetchSafe(`${keyAverage}/eq/frequency-response?smoothing=1%2F1&ppo=96`);
    const sData = new DataView(Uint8Array.from(atob(sResponse.magnitude), c => c.charCodeAt(0)).buffer);
    const calcDiff = (data, startFreq, ppo) => {
        const getVal = f => data.getFloat32(Math.round(Math.log2(f / startFreq) * ppo) * 4, false);
        return getVal(120) - getVal(240);
    };
    const diff = Math.abs(calcDiff(tData, tResponse.startFreq, tResponse.ppo) - calcDiff(sData, sResponse.startFreq, sResponse.ppo));
    if (diff < bestDiff) {
      bestDiff = diff;
      bestFreq = freq;
    }
  }
  console.log(`Optimized 'LPF for LFE' frequency for bass management: ${bestFreq}Hz`);
  lpf4LFE = bestFreq;
  await postDelete (keyAverage + 1);
  await postDelete (keyAverage);
  await postNext('Smooth', subIndices, {smoothing: "None"});
  await new Promise(resolve => setTimeout(resolve, speedDelay));}
async function multipleSubs(indices) {
  function generatePermutations(arr) {
    const permutations = [];
    const n = arr.length;
    if (n <= 1) {return [arr];}
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const pair = [arr[i], arr[j]];
        const remaining = arr.filter(num => !pair.includes(num));
        const permute = (prefix, nums) => {
            if (nums.length === 0) {permutations.push([...pair, ...prefix]);}
             else {nums.forEach((num, idx) => permute([...prefix, num], nums.filter((_, i) => i !== idx)));}
        };
        permute([], remaining);
      }
    }
    return permutations;}
  console.info(`Multiple sub optimization process starting...`);
  const allPermutations = generatePermutations(indices);
  if(nSubs === 3) console.info(`This might take a while...`);
  if(nSubs === 4) console.warn(`This will take a while with all these subs in your setup, go grab yourself a coffee...`);
  let bestFinalScore = -Infinity;
  let bestAlignedSumIndex = null;
  let bestmSecs = null;
  let bestInverts = null;
  let bestPermutation = null;
  let foundSolution = false;
  for (const [index, permutation] of allPermutations.entries()) {
   const percentageComplete = ((index + 1) / allPermutations.length * 100).toFixed(2);
   console.infoUpdate(`Processing permutation ${index + 1}/${allPermutations.length} (${percentageComplete}% complete): ${permutation.map(sw => `SW${sw - nSpeakers}`).join(' → ')}`);
   const result = await processSubConfig(permutation);
   if (result) {
     foundSolution = true;
     const {newIndex, finalScore, mSecs, isInverteds} = result;
     if (finalScore > bestFinalScore) {
       bestPermutation = permutation;
       bestFinalScore = finalScore;
       bestAlignedSumIndex = newIndex;
       bestmSecs = mSecs;
       bestInverts = isInverteds;
     }
   }
  };
  if (!foundSolution) {
    console.warn(`No solutions were found to time align your subwoofers with each other within your receiver hardware limits and optimization cannot continue!`);
    console.error(`Check your subwoofer(s) for causes of excessive line delays like filters, wireless dongles, MiniDSP and re-measure your system after sorting out.`);
    throwError();
  }
  bestInverts = bestInverts.map(value => value || false);
  console.log('\nOptimal multiple sub configuration found:');
  console.info('Permutation:');
  console.info(`  ${bestPermutation.map(sw => `SW${sw - nSpeakers}`).join(' → ')}`);
  console.info('Calculated optimal time delays:');
  console.info(`  ${bestmSecs.map((ms, index) => `SW${index + 1}: ${-ms.toFixed(2)}ms`).join('\n  ')}`);
  console.info('Initial polarity inversions:');
  console.info(`  ${bestInverts.map((invert, index) => `SW${index + 1}: ${invert}`).join('\n  ')}`);
  await postSafe(`${baseUrl}/${bestAlignedSumIndex}/command`, {command: "Response copy"}, "Completed");
  let allResponses = await fetchREW();
  let nTotal = Object.keys(allResponses).length;
  await fetchREW(nTotal, 'PUT', {title: "SW1o"});
  const adjustSubsVolume = - 20 * Math.log10(nSubs);
  await postNext('Add SPL offset', nTotal, {offset: adjustSubsVolume});
  console.info(`Subwoofers ${Array.from({length: nSubs}, (_, i) => `SW${i+1}`).join(', ').replace(/, ([^,]*)$/, ' and $1')} time aligned, level matched and summed.`);
  for (let i = nTotal - 1; i > nSpeakers; i--) await postDelete(i);
  bestmSecs.forEach((ms, k) => {
    const i = nSpeakers + 1 + k;
    mSec[i] = ms / 1000;
    customInvert[i] = bestInverts[k];
  });}
async function processSubConfig(subIndices) {
  let maxPositiveDelay = hardPositive;
  let maxNegativeDelay = hardNegative;
  let delay, newIndex, finalScore;
  subIndices.forEach(index => {customInvert[index] = false, mSec[index] = 0;});
  let indexA = subIndices[0];
  for (let i = 1; i < subIndices.length; i++) {
    const indexB = subIndices[i];
    const {bestFrequency, bestDelay, bestInvert} = await alignImpulses(indexA, indexB, maxNegativeDelay, maxPositiveDelay, lpf4LFE);
    if (bestFrequency === null) {console.info(`No solution with that permutation!`); return false;}
    await postSafe(`http://localhost:4735/alignment-tool/delay-b`, bestDelay, `Value set`);
    await postSafe(`http://localhost:4735/alignment-tool/invert-b`, bestInvert, `Value set`);
    const alignedSum = await postAlign('Aligned sum');
    newIndex = parseInt(Object.keys(alignedSum.results)[0], 10); 
    mSec[indexB] = -bestDelay;
    customInvert[indexB] = bestInvert;
    const offsetsUsed = subIndices.slice(0, i + 1).map(j => mSec[j]);
    const minOffset = Math.min(...offsetsUsed);
    const maxOffset = Math.max(...offsetsUsed);
    const currentSpread = maxOffset - minOffset;
    if (currentSpread > modelDelayLimit) {
      console.info(
        `No solution with that permutation: total delay spread = ${currentSpread.toFixed(2)}ms > ${modelDelayLimit}ms.`
      );
      return false;
    }
    const leftover = modelDelayLimit - currentSpread;
    let nextMinAllowed = Math.max(hardNegative, minOffset - leftover);
    let nextMaxAllowed = Math.min(hardPositive, maxOffset + leftover);
    if (nextMinAllowed > 0) nextMinAllowed = 0;
    if (nextMaxAllowed < 0) nextMaxAllowed = 0;
    maxNegativeDelay = nextMinAllowed;
    maxPositiveDelay = nextMaxAllowed;
    if (maxPositiveDelay < maxNegativeDelay) {
      console.info(`No solution: leftover range inverted (pos < neg).`);
      return false;
    }
    indexA = newIndex;
  }
  const response = await fetchSafe('impulse-response?normalised=false', newIndex);
  const bytes = Uint8Array.from(atob(response.data), c => c.charCodeAt(0));
  const dataView = new DataView(bytes.buffer);
  const filter = Array.from({length: bytes.length / 4}, (_, i) => dataView.getFloat32(i * 4, false));
  const [lowest, highest] = filter.reduce(([low, high], value) => [Math.min(low, value), Math.max(high, value)], [Infinity, -Infinity]);
  finalScore = Math.max(Math.abs(lowest), highest) * 100;
  return {newIndex, finalScore, mSecs: mSec.slice(-subIndices.length), isInverteds: customInvert.slice(-subIndices.length)};}
async function alignImpulses(impulse1, impulse2, negLimit, posLimit, analyseEnd) {
  function extractAlignmentResults(resultData) {
    if (resultData?.message === 'Delay too large') {
      const delayMatch = resultData.error.match(
        /delay required to align the responses.*?(-?[\d.]+) ms/
      );
      return {
        error: true,
        message: 'Delay too large',
        delay: delayMatch ? parseFloat(delayMatch[1]) : null
      };
    }
    const firstResult = resultData.results?.[0];
    if (!firstResult) return null;
    if (firstResult['Delay B ms'] !== undefined) {
      return {
        error: false,
        delayB: parseFloat(firstResult['Delay B ms']),
        invertB: firstResult['Invert B'] === 'true'
      };
    }
    return null;}
  console.infoUpdate(`Available delay range: ${negLimit}ms to ${posLimit}ms`);
  await postSafe("http://localhost:4735/alignment-tool/index-a", impulse1, "selected as measurement A");
  await postSafe("http://localhost:4735/alignment-tool/index-b", impulse2, "selected as measurement B");
  await postSafe("http://localhost:4735/alignment-tool/mode", "Impulse", "Mode set");
  await postSafe("http://localhost:4735/alignment-tool/remove-time-delay", false, "Value set");
  await postAlign('Reset all');
  await postSafe("http://localhost:4735/alignment-tool/max-negative-delay", -posLimit, "Maximum negative delay set");
  await postSafe("http://localhost:4735/alignment-tool/max-positive-delay", -negLimit, "Maximum positive delay set");
  let bestScore = -Infinity;
  let bestFrequency = null;
  let bestDelay = null;
  let bestInvert = null;
  for (let i = 20; i <= 250; i++) {
    console.infoUpdate(`Analyzing alignment at ${i} Hz...[${Math.round((i - 21) / 2.3)}%]`);
    const processResult = await postAlign('Align IRs', i);
    const results = extractAlignmentResults(processResult);
    if (results?.error) {
      results.delay > hardPositive
        ? console.infoUpdate(`Subwoofer kicks off ${Math.abs(results.delay - hardPositive).toFixed(2)}ms too late @ ${i}Hz!`)
        : console.infoUpdate(`Subwoofer kicks off ${Math.abs(hardNegative - results.delay).toFixed(2)}ms too early @ ${i}Hz!`);
      continue;
    }
    const response = await fetchAlign('aligned-frequency-response?smoothing=Psy&ppo=96');
    const {startFreq: startFreqAligned, magnitude: magnitudeAligned} = response;
    const startFreq = startFreqAligned;
    const bytes = Uint8Array.from(atob(magnitudeAligned), c => c.charCodeAt(0));
    const data = new DataView(bytes.buffer);
    const magAligned = Array.from({ length: bytes.length / 4 }, (_, k) => data.getFloat32(k * 4, false));
    const index1 = Math.max(0, Math.round(Math.log2(17.68 / startFreq) * 96));
    const index2 = Math.round(Math.log2(analyseEnd / startFreq) * 96);
    const startIndexAligned = Math.max(0, Math.round(Math.log2(startFreq / startFreqAligned) * 96));
    const alignedLinear = magAligned
      .slice(startIndexAligned + index1, startIndexAligned + index2)
      .map(value => Math.pow(10, value / 20));
    const totalOutput = alignedLinear.reduce((acc, val) => acc + val, 0);
    const averageOutput = totalOutput / alignedLinear.length;
    if (averageOutput > bestScore) {
      bestScore = averageOutput;
      bestFrequency = i;
      bestDelay = results.delayB;
      bestInvert = results.invertB;
      console.infoUpdate(`New permutation best => freq: ${bestFrequency}Hz, delay: ${-bestDelay.toFixed(2)}ms, polarity: ${bestInvert}`);
    }
  }
  return {bestFrequency, bestDelay, bestInvert};}
async function generateRoll(freq, index, isSub = false) {
  if (freq === 0) {
    await postSafe(`${baseUrl}/${index}/command`, {command: 'Response copy'}, 'Completed');
    const allResponses = await fetchREW();
    return parseInt(Object.keys(allResponses).length, 10);
  }
  const filter = {"index": 21, "enabled": true, "isAuto": false, "frequency": freq, "shape": isSub ? "L-R" : "BU", "slopedBPerOctave": isSub ? 24 : 12, "type": isSub ? "Low pass" : "High pass"};
  await postSafe(`${baseUrl}/${index}/filters`, {filters: [filter]}, "Filters set");
  await new Promise((resolve) => setTimeout(resolve, speedDelay));
  const rollResponse = await postNext('Generate predicted measurement', index);
  await new Promise((resolve) => setTimeout(resolve, speedDelay));
  return parseInt(Object.keys(rollResponse.results)[0]);}
async function setVolumeLevels() {
  console.log(`\nFinal speaker volume level offsets optimized for peak perceptual response:`)
  await postSafe(`${baseUrl}/${1}/target-settings`, {shape: "None"}, "Update processed");
  await postSafe(`http://localhost:4735/eq/house-curve`, targetCurvePath, "House curve set");
  await postSafe(`${baseUrl}/${1}/room-curve-settings`, {addRoomCurve: false}, "Update processed");
  await postNext('Calculate target level', 1);
  await postNext('Generate target measurement', 1);
  let indices = Array.from({length: nSpeakers}, (_, i) => i + 1);
  indices.push(nSpeakers + 2);
  const weightedAverages = await Promise.all(indices.map(async (index) => {
      const response = await fetchSafe(`frequency-response?smoothing=1%2F48&ppo=96`, index);
      const dataResponse = new DataView(Uint8Array.from(atob(response.magnitude), c => c.charCodeAt(0)).buffer);
      const resStartIndex = Math.round(Math.log2(224.646286 / response.startFreq) * response.ppo);
      return Array.from({length: 540}, (_, i) => dataResponse.getFloat32((resStartIndex + i) * 4, false)).reduce((sum, mag, i) => sum + mag * resonEar[i], 0) / 5121.929;})
  );
  const meanWeightedAverage = weightedAverages.slice(0, -1).reduce((sum, avg) => sum + avg, 0) / (weightedAverages.length - 1);
  const differences = weightedAverages.map(avg => avg - meanWeightedAverage);
  let sumError = 0;
  for (let i = 0; i < indices.length - 1; i++) {
    customLevel[i + 1] = Math.round(-differences[i] * 2) / 2;
    await postNext('Add SPL offset', indices[i], {offset: customLevel[i + 1]});
    console.log(` Speaker ${commandId[i + 1]}: ${customLevel[i + 1] > 0 ? '+' : customLevel[i + 1] === 0 ? '' : '-'}${Math.abs(customLevel[i + 1]).toFixed(1)}dB`);
    sumError += Math.abs(customLevel[i + 1] + differences[i]);
  }
  await postNext('Add SPL offset', nSpeakers + 2, {offset: -differences.at(-1)});
  responseTarget = await fetchSafe(`frequency-response?smoothing=1%2F48&ppo=96`, nSpeakers + 2);
  dataTarget = new DataView(Uint8Array.from(atob(responseTarget.magnitude), c => c.charCodeAt(0)).buffer);
  const tRead = await fetchREW(nSpeakers + 2);
  targetLevel = parseFloat(tRead.splOffsetdB);
  console.info(`Final target level:: ${targetLevel.toFixed(2)}dB`);
  sumError /= indices.length;
  console.info(`Alignment accuracy: ±${sumError.toFixed(2)}dB`);
  const normalizedPath = targetCurvePath.replace(/\\/g, "/");
  tcName = normalizedPath.split("/").pop().replace(/\.[^/.]+$/, "").replace(/\s+/g, "");
  tcName = `tc${tcName} ${targetLevel.toFixed(2)}dB`;
  await fetchREW(nSpeakers + 2, 'PUT', {title: tcName});}
async function optimizeSubVolume(){
  console.info(`Calculating optimal subwoofer volume offset...`);
  console.info(`Available range: ${subMinTrim}dB - +${subMaxTrim}dB`);
  await postSafe(`${baseUrl}/${nSpeakers + 2}/target-settings`, {shape: "None"}, "Update processed");
  await postSafe(`http://localhost:4735/eq/house-curve`, targetCurvePath, "House curve set");
  await postSafe(`${baseUrl}/${nSpeakers + 2}/room-curve-settings`, {addRoomCurve: false}, "Update processed");
  await postSafe(`${baseUrl}/${nSpeakers + 2}/filters`, {filters: [
      {index: 21, type: "Low pass", enabled: true, isAuto: false, frequency: 80, shape: "BU", slopedBPerOctave: 6},
      {index: 22, type: "High pass", enabled: true, isAuto: false, frequency: 30, shape: "BU", slopedBPerOctave: 6}
    ]}, "Filters set");
  await new Promise(resolve => setTimeout(resolve, speedDelay));
  const tx = await postNext('Generate predicted measurement', nSpeakers + 2);
  await new Promise((resolve) => setTimeout(resolve, speedDelay));
  const key = parseInt(Object.keys(tx.results)[0]);
  await postNext('Add SPL offset', key, {offset: 10});
  const subShift = await postNext('Align SPL', [nSpeakers + 1, key], {
      frequencyHz: 48.989795,
      spanOctaves: 1.4150375,
      targetdB: 'average'
  });
  const delta = parseFloat(subShift.results[nSpeakers + 1].alignSPLOffsetdB);
  await postNext('Add SPL offset', nSpeakers + 1, {offset: -delta});
  let deltaRounded = Math.round(delta * 4) / 2;
  if (deltaRounded > subMaxTrim || deltaRounded < subMinTrim) {
      const exceedAmount = deltaRounded > subMaxTrim 
          ? Math.abs(deltaRounded - subMaxTrim)
          : Math.abs(deltaRounded - subMinTrim);
      console.warn(`Required subwoofer volume offset level exceeds hardware limits by ${exceedAmount.toFixed(1)}dB and is being capped!`);
      console.warn(`Optimization will not generate the best possible results with volume levels capped at limits!`)
      console.warn(`Next time you measure your system, adjust your subwoofer gain levels accordingly and/or consider placing them elsewhere in the room.`);
      deltaRounded = Math.min(Math.max(deltaRounded, subMinTrim), subMaxTrim);
  }
  console.log(`Final subwoofer volume: ${deltaRounded}dB`);
  if (bassFill != 0) {
    deltaRounded += bassFill;
    deltaRounded = Math.max(-12, Math.min(12, deltaRounded));
    console.warn(`Forced bass boost: ${bassFill}dB; Forced final subwoofer volume: ${deltaRounded}dB`);
  }
  await postNext('Add SPL offset', nSpeakers + 1, {offset: deltaRounded});
  for (let i = 1; i <= nSubs; i++) {
    customLevel[nSpeakers + i] = deltaRounded + (subTrim[i] || 0);
  }
  await postDelete(key);
  await generateRoll(lpf4LFE, nSpeakers + 1, true);}
async function getXovers() {
 await postSafe(`${baseUrl}/${1}/target-settings`, {shape: "None"}, "Update processed");
 await postSafe(`http://localhost:4735/eq/house-curve`, targetCurvePath, "House curve set");
 await postSafe(`${baseUrl}/${1}/room-curve-settings`, {addRoomCurve: false}, "Update processed");
 isLarge = new Array(nSpeakers + 1).fill(false);
 let flFrIsLarge = false;
 const findBestOption = (options) =>
   options.reduce((best, option) =>
     option.totalScore > best.totalScore ? option : best,
   { freq: null, totalScore: -Infinity });
   const hasPositiveScoreBelowFreq = (scores, splDiffs, freqIndex, freqThreshold) => {
    let hasSufficientScore = false;
    scores.forEach((score, idx) => {
      if (freqIndex[idx] < freqThreshold) {
        console.log(`${freqIndex[idx]}Hz: ${splDiffs[idx].toFixed(1)}dB from target (efficiency: ${score.toFixed(1)}%)`);
        if (score > -20) hasSufficientScore = true;
      }
    });
    return hasSufficientScore;
  };
 const mapOptions = (freqIndex, scores1, scores2) =>
   freqIndex.map((freq, idx) => ({
     freq,
     score1: scores1[idx],
     score2: scores2[idx],
     totalScore: scores1[idx] + scores2[idx],
   }));
   for (let i = 1; i <= nSpeakers;) {
    let isPair = !["C", "CH", "SB", "TS"].includes(commandId[i]);
    if (commandId[i] === "SBL" && !commandId.includes("SBR")) isPair = false;
    console.info(`Analysing crossover frequencies for speaker${isPair ? ` pair: ${commandId[i]} / ${commandId[i + 1]}` : `: ${commandId[i]}`}...`);
    
    let {scores: scores1, bestFreq: bestFreq1, bestScore: bestScore1, splDiffs: splDiffs1} = await getRoll(i);
    
    if (isPair) {
      let {scores: scores2, bestFreq: bestFreq2, bestScore: bestScore2, splDiffs: splDiffs2} = await getRoll(i + 1);
      
      scores1.forEach((score, index) => {
        const totalScore = score + scores2[index];
        const message = `Frequency: ${freqIndex[index]}Hz, Efficiency: ${score.toFixed(2)}% (${splDiffs1[index].toFixed(1)}dB) + ${scores2[index].toFixed(2)}% (${splDiffs2[index].toFixed(1)}dB) => ${totalScore.toFixed(2)}%`;
        if (score > 0 && scores2[index] > 0) {
          console.log(message);
        } else {
          console.info(message);
        }});
 
      let bestPairFreq = null;
      let cappedPair = false;
      const qualifiesForForceLarge = 
        hasPositiveScoreBelowFreq(scores1, splDiffs1, freqIndex, 90) || 
        hasPositiveScoreBelowFreq(scores2, splDiffs2, freqIndex, 90) || 
        (bestFreq1 < 90 && bestFreq2 < 90);
     if (forceLarge && commandId[i] === 'FL') {
       if (qualifiesForForceLarge) {
         console.warn(`Large front speakers detected, 'LFE + Main' mode will be set!`);
         bestFreq1 = 0; bestFreq2 = 0; bestScore1 = 100; bestScore2 = 100; bestPairFreq = 0;
       } else {
         console.warn(`Front speakers do not qualify for 'Full Range / LFE + Main' mode!`);
       }}
     const positiveOptions = mapOptions(freqIndex, scores1, scores2).filter(option => option.score1 > 0 && option.score2 > 0);
     const below120Options = positiveOptions.filter(option => option.freq < 120);
     const aboveOrEqual120Options = positiveOptions.filter(option => option.freq >= 120);
     if (below120Options.length > 0) {
       bestPairFreq = findBestOption(below120Options).freq;
     } else if (aboveOrEqual120Options.length > 0) {
       bestPairFreq = findBestOption(aboveOrEqual120Options).freq;
     }
     if (!bestPairFreq) {
       const fallbackOption = findBestOption(mapOptions(freqIndex, scores1, scores2));
       bestPairFreq = fallbackOption.freq;
     }
     if (bestFreq1 !== 0 && bestFreq2 !== 0 && Math.min(bestFreq1, bestFreq2) < 120 && bestPairFreq > 120) {
       bestPairFreq = Math.min(bestFreq1, bestFreq2);
       cappedPair = true;
     }
     const selectedPairScore = bestPairFreq === 0
       ? 0
       : scores1[freqIndex.indexOf(bestPairFreq)] + scores2[freqIndex.indexOf(bestPairFreq)] || 0;
     console.info("> Individual best crossover frequencies and scores:");
     console.info(`- Speaker: ${commandId[i]}, Frequency: ${bestFreq1 === 0 ? "Full range" : `${bestFreq1}Hz `}, Efficiency: ${bestScore1.toFixed(2)}%`);
     console.info(`- Speaker: ${commandId[i + 1]}, Frequency: ${bestFreq2 === 0 ? "Full range" : `${bestFreq2}Hz `}, Efficiency: ${bestScore2.toFixed(2)}%`);
     console.log(`>> Best crossover frequency for pair ${commandId[i]}/${commandId[i + 1]}:`);
     console.log(`${bestPairFreq === 0 ? "Full range" : `${bestPairFreq}Hz`}${cappedPair ? " (down shifted)" : ""}`);
     console.log(`Pair Efficiency: ${(selectedPairScore / 2).toFixed(2)}%`);
     customCrossover[i] = customCrossover[i + 1] = bestPairFreq;
     isLarge[i] = isLarge[i + 1] = qualifiesForForceLarge && bestFreq1 === 0 && bestFreq2 === 0;
     i += 2;
   }
    else {
     scores1.forEach((score, index) => {console.info(`Frequency: ${freqIndex[index]}Hz, Efficiency: ${score.toFixed(2)}%`);});
     let bestSingleFreq = bestFreq1 === 0
       ? 0
       : freqIndex.reduce((best, freq, idx) => {
       const sumScore = scores1[idx];
       return sumScore > best.sumScore ? {sumScore, freq} : best;
     }, {sumScore: -Infinity, freq: null}).freq;
     let cappedC = false;
     if (commandId[i] === "C" && bestFreq1 > 120) {
       const cappedOptions = freqIndex
         .map((freq, idx) => ({freq, sumScore: scores1[idx]}))
         .filter(option => option.freq <= 120);
       if (cappedOptions.length > 0) {
         const bestCapped = cappedOptions.reduce(
           (best, option) => option.sumScore > best.sumScore ? option : best,
           {sumScore: -Infinity, freq: null}
         );
         bestFreq1 = bestCapped.freq;
         bestSingleFreq = bestFreq1;
         cappedC = true;
       }
     }
     const selectedScore = bestSingleFreq === 0 ? 0 : scores1[freqIndex.indexOf(bestSingleFreq)] || 0;
     console.log(`>> Best crossover frequency for speaker ${commandId[i]}: ${bestSingleFreq === 0 ? "Full range" : `${cappedC ? ` (down shifted) ${bestSingleFreq}` : bestSingleFreq}Hz`}`);
     customCrossover[i] = bestSingleFreq;
     isLarge[i] = flFrIsLarge && bestFreq1 === 0;
     i += 1;
    }
 };
 if (sameXover) {
   const findNearestFrequency = (avgFreq, freqIndex) => freqIndex.reduce((a, b) => Math.abs(b - avgFreq) < Math.abs(a - avgFreq) ? b : a);
   const totalCrossover = Array.from({ length: nSpeakers }, (_, i) => customCrossover[i + 1] || 20).reduce((sum, val) => sum + (val === 0 ? 20 : val), 0);
   const averageCrossover = totalCrossover / nSpeakers;
   const roundedFrequency = findNearestFrequency(averageCrossover, freqIndex);
   for (let i = 1; i <= nSpeakers; i++) {customCrossover[i] = roundedFrequency;}
   console.warn(`User override: All speakers will be crossed-over at ${roundedFrequency}Hz!`)
 }}
 async function getRoll(index) {

  
  function getPenaltyMap(id) {
    const penalty = {
      40: 1.25, 
      60: 1.05, 
      80: 1.00, 
      90: 1.02, 
      100: 1.05, 
      110: 1.10, 
      120: 1.25, 
      150: 2.10, 
      180: 2.80, 
      200: 3.20, 
      250: 4.15
    };
    
    const isDolby = ["BDL", "BDR", "FDL", "FDR", "SDL", "SDR"].includes(id);
    if (isDolby) {
      return {
        ...penalty, 
        40: 4, 
        60: 3, 
        80: 2.5, 
        90: 2, 
        100: 1.2, 
        110: 1.1, 
        120: 1, 
        150: 1.5
      };
    }
    return penalty;
  }

  let bestDiff = Infinity, bestFreq = null, bestScore = -Infinity, fullRange = false, scores = [], splDiffs = [];
  const penaltyMap = getPenaltyMap(commandId[index]);
  
    for (const freq of freqIndex) {
      await postSafe(`${baseUrl}/${index}/filters`, {filters: [{
        index: 21, 
        type: "High pass", 
        enabled: true, 
        isAuto: false, 
        frequency: freq, 
        shape: "BU", 
        slopedBPerOctave: 12
      }]}, "Filters set");
  
      await new Promise(resolve => setTimeout(resolve, speedDelay));
      
      const speakerResponse = await fetchSafe(`${index}/eq/frequency-response?smoothing=Psy&ppo=96`);
      const speakerData = new DataView(Uint8Array.from(atob(speakerResponse.magnitude), c => c.charCodeAt(0)).buffer);
      
      const calcIndex = (f, startFreq, ppo) => Math.round(Math.log2(f / startFreq) * ppo);
      const avgMagnitude = (data, idx) => (data.getFloat32((idx - 1) * 4, false) + 
                                         data.getFloat32(idx * 4, false) + 
                                         data.getFloat32((idx + 1) * 4, false)) / 3;
  
      const sIndex = calcIndex(freq, speakerResponse.startFreq, speakerResponse.ppo);
      const tIndex = calcIndex(freq, responseTarget.startFreq, responseTarget.ppo);
      
      const speakerMag = avgMagnitude(speakerData, sIndex);
      const targetMag = avgMagnitude(dataTarget, tIndex);
      
      // Calculate and store SPL difference
      const splDiff = speakerMag - targetMag;
      splDiffs.push(splDiff);
  
      const diff = Math.abs(speakerMag - targetMag + 6) * (penaltyMap[freq] || 1);
      const currentScore = 100 * (1 - diff / 6);
      scores.push(currentScore);
  
      if (currentScore > bestScore) {
        bestScore = currentScore;
        bestFreq = freq;
      }
    }
  
    return {scores, bestFreq, bestScore, splDiffs};
  }
async function alignSub() {
  console.info(`Optimizing subwoofer relative timing...`)
  let indices = [], filteredSpeaker = [];
  let flatIndices = Array.from({length: nSpeakers}, (_, i) => i + 1);
  for (let i = 1; i <= nSpeakers; i++) {
    filteredSpeaker[i] = await generateRoll(customCrossover[i], i);
    indices.push(filteredSpeaker[i]);
    if (isLarge[i]) {
      indices.push(filteredSpeaker[i]);
      //flatIndices.push(i);
    }
  }
  const vectorAverage = await postNext('Vector average', sameXover ? indices : flatIndices);
  await new Promise((resolve) => setTimeout(resolve, speedDelay));
  indices = [...new Set(indices)];
  const key = parseInt(Object.keys(vectorAverage.results)[0], 10);
  let fSubIndex = nSpeakers + 1;
  if (sameXover) {
    console.log(`Further optimizing subwoofer alignment for all identical crossover frequencies...`)
    const allpassQ = Math.sqrt(2) / 3;
    fSubIndex = await generateRoll(customCrossover[1], nSpeakers + 1, true);
    await postSafe(`${baseUrl}/${fSubIndex}/filters`, {filters: [{index: 20, type: "All pass", enabled: true, isAuto: false, frequency: customCrossover[1], q: allpassQ}]}, "Filters set");
    await new Promise((resolve) => setTimeout(resolve, speedDelay));
    await postNext('Generate predicted measurement', fSubIndex);
    await new Promise((resolve) => setTimeout(resolve, speedDelay));
    await postDelete(fSubIndex);
  }
  const {bestFrequency, bestDelay, bestInvert} = await alignImpulses(key, fSubIndex, hardNegative, hardPositive, 224 * Math.sqrt(2));
  if (bestFrequency === null) {console.error(`Subwoofer time alignment not possible with that combination!`); throwError();}
  console.info(`Best alignment found at ${bestFrequency}Hz`);
  console.info(`Applied delay: ${-bestDelay.toFixed(2)}ms, Inverted? ${bestInvert}`);
  if (sameXover) await postDelete(fSubIndex);
  await postDelete(key);
  const offset = - bestDelay / 1000;
  await postNext('Offset t=0', nSpeakers + 1, {offset: offset, unit: "seconds"});
  await postNext('Offset t=0', nSpeakers + 3, {offset: offset, unit: "seconds"});
  console.log(`Final distance and polarity settings:`);
  console.log(`(Speaker distances may not represent actual distances with Evo Neuron. 'Distance differences' in time domain are being used for high precision channel syncing)`);
  let minDist = Infinity;
  for (let i = 1; i <= nSpeakers + nSubs; i++) {
    if (i > nSpeakers) {
      mSec[i] += offset;
      customInvert[i] = customInvert[i] !== bestInvert;
    }
    customDistance[i] = Math.round((distFL + (mSec[i] - mSec[1]) * sOs) * 100) / 100;
    if (customDistance[i] < minDist) minDist = customDistance[i];
    if (customDistance[i] > (minDist + 6)) customDistance[i] = minDist + 6;
  }
  if (minDist < 0) {
    for (let i = 1; i <= nSpeakers + nSubs; i++) {
      customDistance[i] -= minDist;
    }
  }
  for (let i = 1; i <= nSpeakers + nSubs; i++) {
    console.log(
      `${commandId[i]}: ${customDistance[i].toFixed(2)}m ` +
      `(${(customDistance[i] * 3.28084).toFixed(2)}ft), ` +
      `polarity inverted? ${customInvert[i]}`
    );
  }
  if (customInvert.some(Boolean)) console.warn(`ALL polarity inversions listed above will be automatically applied by Neuron!`);
  if (customInvert[nSpeakers + 1]) {
    await postSafe(`${baseUrl}/${nSpeakers + 1}/command`, {command: "Invert"}, "Invert completed");
    await postSafe(`${baseUrl}/${nSpeakers + 3}/command`, {command: "Invert"}, "Invert completed");
  }
  return {filteredSpeaker, indices};}
async function calculateLargeSpeaker() {
  if (!isLarge.some(Boolean)) return;
  for (let i = 1; i <= nSpeakers;) {
    if (isLarge[i]) {
      let isPair = !["C", "CH", "SB", "TS"].includes(commandId[i]);
      if (commandId[i] === "SBL" && !commandId.includes("SBR")) isPair = false;
      LFE = false;
      let bestSum = -Infinity;
      let bestFreq = null;
      const centerFreq = 80;
      const rangeFactor = 2.25;
      const [lowRange, highRange] = [centerFreq / Math.pow(2, rangeFactor), centerFreq * Math.pow(2, rangeFactor)];
      console.info(`Analysing 'Full range / Large' & 'LFE + Main' option for speaker${isPair ? ` pair: ${commandId[i]} / ${commandId[i + 1]}` : `: ${commandId[i]}`}...`);
      const vAverage = await postNext("Vector average", [i, isPair ? i + 1 : i]);
      await new Promise(resolve => setTimeout(resolve, speedDelay));
      const keySP = parseInt(Object.keys(vAverage.results)[0], 10);
      for (const freq of freqIndex) {
        const keySub = await generateRoll(freq, nSpeakers + 1, true);
        const vSum = await postNext("Vector sum", [keySP, keySub]);
        await new Promise((resolve) => setTimeout(resolve, speedDelay));
        const keySum = parseInt(Object.keys(vSum.results)[0], 10);
        const speakerResponse = await fetchSafe('frequency-response?smoothing=1%2F48&ppo=96', keySum);
        const dataSpeaker = new DataView(Uint8Array.from(atob(speakerResponse.magnitude), c => c.charCodeAt(0)).buffer);
        const sStartIndex = Math.round(Math.log2(lowRange / speakerResponse.startFreq) * speakerResponse.ppo);
        const sEndIndex = Math.round(Math.log2(highRange / speakerResponse.startFreq) * speakerResponse.ppo);
        const rangeLength = sEndIndex - sStartIndex + 1;
        let maxMagnitude = -Infinity;
        for (let i = 0; i < rangeLength; i++) {
          const speakerMag = dataSpeaker.getFloat32((sStartIndex + i) * 4, false);
          maxMagnitude = Math.max(maxMagnitude, speakerMag);
        }
        console.info(`Subwoofer bass lowpass filter frequency: ${freq}Hz, max magnitude: ${maxMagnitude.toFixed(2)}dB`);
        if (maxMagnitude > bestSum) {
          bestSum = maxMagnitude;
          bestFreq = freq;
        }
      }
      console.log(`Speakers set to 'Large / Full Range', subwoofer mode set to 'LFE + Main'`);
      console.log(`Best 'bass extraction / lowpass filter frequency' for subwoofer: ${bestFreq}Hz, SPL: ${bestSum.toFixed(2)}dB`);
      customCrossover[i] = bestFreq;
      if (isPair) {
        customCrossover[i + 1] = bestFreq;
      }
      i += isPair ? 2 : 1;
      const allResponses = await fetchREW();
      const nTotal = Object.keys(allResponses).length;
      for (let i = nTotal; i >= keySP; i--) {
        await postDelete(i);
      }
    } else {
      i++;
    }
  }}
async function generateResults(filteredSpeaker, indices){
  console.info(`Generating magnitude and phase correction filters for channel:`);
  const fSubIndex = await genFilter(nSpeakers + 1);
  for (let i = nSpeakers + 1; i <= nSpeakers + nSubs; i++) {
    if (customInvert[i]) {
      customFilter[i] = customFilter[0].map((value) => -value);
    } else {
      customFilter[i] = customFilter[0];
    }
  }
  for (let i = 1; i <= nSpeakers; i++) {
    console.info(`${commandId[i]}`);
      filteredSub = await generateRoll(customCrossover[i], fSubIndex, true);
      const spResponse = await postNext("Vector sum", [filteredSpeaker[i], filteredSub]);
      await new Promise((resolve) => setTimeout(resolve, speedDelay));
      const responseKey = parseInt(Object.keys(spResponse.results)[0], 10);
      let allPass = 0;
      /*if (!isLarge[i] || commandId[i] === "C") {
        const filter = {"index": 1, "type": "All pass", "enabled": true, "isAuto": false, "frequency": customCrossover[i], "q": 0.57735};
        await postSafe(`${baseUrl}/${filteredSpeaker[i]}/filters`, {filters: [filter]}, "Filters set");
        await new Promise((resolve) => setTimeout(resolve, speedDelay));
        const spAP = await postNext('Generate predicted measurement', filteredSpeaker[i]);
        await new Promise((resolve) => setTimeout(resolve, speedDelay));
        const apKey = parseInt(Object.keys(spAP.results)[0]);
        const spAPresponse = await postNext("Vector sum", [filteredSub, apKey]);
        await new Promise((resolve) => setTimeout(resolve, speedDelay));
        const apResKey = parseInt(Object.keys(spAPresponse.results)[0], 10);
        const winner = await ttScore(responseKey, apResKey);
        const nonWinner = winner === responseKey ? apResKey : responseKey;
        await postDelete(nonWinner);
        if (winner === apResKey) {
          await postDelete(apKey - 1);
          console.info(`*Allpass filter applied to above speaker to improve its response!`);
          allPass = customCrossover[i];
        } else {
          await postDelete(apKey);
        }
      }*/
      const title = commandId[i] + "o";
      await fetchREW(responseKey, 'PUT', {title: title});
      const filterIndex = await genFilter(responseKey, false, allPass);
      await postDelete(filterIndex - 2);
      await postDelete(filterIndex - 3);
  }
  for (let i = indices.length - 1; i >= 0; i--) {
    await postDelete(indices[i]);
  };
  const lfeGraph = await postNext('Arithmetic', [nSpeakers + 3, nSpeakers + 4], {function: "A * B"});
  await new Promise((resolve) => setTimeout(resolve, speedDelay));
  const lfeKey = parseInt(Object.keys(lfeGraph.results)[0], 10);
  await fetchREW(lfeKey, 'PUT', {title: "LFE"});
  await postDelete(nSpeakers + 5);
  await postDelete(nSpeakers + 3);
  const allResponses = await fetchREW();
  const nTotal = Object.keys(allResponses).length;
  let ind = [];
  for (let i = 1; i <= nTotal; i++) {
    const title = allResponses[i].title;
    if (title.includes('final')) {
      ind.push(i);
    }
  }
  await postNext('Smooth', ind, {smoothing: xt32 ? "Var" : "Psy"});}
async function genFilter(index, isSub = true, allPass = 0) {
  const sampleCount = xt32 ? (isSub ? 16055 : 16321) : (!xt && !isSub ? 128 : (isSub ? 512 : 512));
  const rightWindowWidth = sampleCount / ((xt32 || !isSub) ? 48 : 6);
  const targetIndex = nSpeakers + 2;
  const mp = await postNext('Minimum phase version', index, {
    "include cal": true,
    "append lf tail": false,
    "append hf tail": false,
    "frequency warping": false,
    "replicate data": true
  });
  mpIndex = parseInt(Object.keys(mp.results)[0]);
  await postSafe(`${baseUrl}/${mpIndex}/target-settings`, {shape: "None"}, "Update processed");
  await new Promise((resolve) => setTimeout(resolve, speedDelay / 2));
  await postSafe(`http://localhost:4735/eq/house-curve`, targetCurvePath, "House curve set");
  await new Promise((resolve) => setTimeout(resolve, speedDelay / 2));
  await postSafe(`${baseUrl}/${mpIndex}/room-curve-settings`, {addRoomCurve: false}, "Update processed");
  await new Promise((resolve) => setTimeout(resolve, speedDelay / 2));
  const targetRounded = Math.round(targetLevel * 100) / 100;
  await fetchSafe('target-level', mpIndex, targetRounded);
  await new Promise((resolve) => setTimeout(resolve, speedDelay / 2));
  await postNext('Smooth', mpIndex, {smoothing: "None"});
  await new Promise((resolve) => setTimeout(resolve, speedDelay));
  //const allpassQ = 1 / Math.sqrt(3); // Bessel
  const allpassQ = Math.sqrt(2) / 3;
  if (!isSub && (allPass || softRoll)) {
    const filters = [];
    //if (allPass) {filters.push({"index": 1, "type": "All pass", "enabled": true, "isAuto": false, "frequency": allPass, "q": allpassQ});}
    if (softRoll) {filters.push({"index": 20, "type": "HS Q", "enabled": true, "isAuto": false, "frequency": 16000, "gaindB": 2, "q": 0.707106781186548});}
    for (const filter of filters) {
      await postSafe(`${baseUrl}/${mpIndex}/filters`, {filters: [filter]}, "Filters set");
      await new Promise((resolve) => setTimeout(resolve, speedDelay));
    }
  }
  if (isSub && sameXover) {
    await postSafe(`${baseUrl}/${mpIndex}/filters`, {filters: [{index: 20, type: "All pass", enabled: true, isAuto: false, frequency: customCrossover[1], q: allpassQ}]}, "Filters set");
  }
  await postSafe(`http://localhost:4735/eq/match-target-settings`, {startFrequency: 16, endFrequency: 800, individualMaxBoostdB: maxBoost, overallMaxBoostdB: maxBoost, flatnessTargetdB: 1, allowNarrowFiltersBelow200Hz: true, varyQAbove200Hz: false, allowLowShelf: false, allowHighShelf: false}, "Update processed");
  await new Promise((resolve) => setTimeout(resolve, speedDelay));
  await postNext('Match target', mpIndex);
  await new Promise((resolve) => setTimeout(resolve, speedDelay * 2));
  await postNext('Generate filters measurement', mpIndex);
  await new Promise((resolve) => setTimeout(resolve, speedDelay * 2));
  await postSafe(`${baseUrl}/${mpIndex + 1}/ir-windows`, {leftWindowType: "Rectangular", rightWindowType: "Rectangular", leftWindowWidthms: 0, rightWindowWidthms: rightWindowWidth, refTimems: 0, addFDW: false}, "Update processed");
  let name = await fetchREW(index);
  name = name.title.slice(0, -1);
  if (name.includes("SW")) name = "SW1";
  const relIndex = commandId.findIndex(id => id === name);
  let title = name + "filter";
  await fetchREW(mpIndex + 1, 'PUT', {title: title});
  const response = await fetchSafe('impulse-response?windowed=true&samplerate=' + ((xt32 || !isSub) ? '48000' : '6000'), mpIndex + 1);
  const bytes = Uint8Array.from(atob(response.data), c => c.charCodeAt(0));
  const dataView = new DataView(bytes.buffer);
  const filter = new Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const invertFactor = isSub ? 1 : (customInvert[relIndex] ? -1 : 1);
    filter[i] = dataView.getFloat32(i * 4, false) * Math.pow(10, -0.40) * invertFactor;
  }
  if (isSub) {
    await postNext('Arithmetic', [relIndex, mpIndex + 1], {function: "A * B"});
    await new Promise((resolve) => setTimeout(resolve, speedDelay));
    customFilter[0] = filter;
  } else {
    await postNext('Arithmetic', [index, mpIndex + 1], {function: "A * B"});
    await new Promise((resolve) => setTimeout(resolve, speedDelay));
    customFilter[relIndex] = filter;
  }
  await postNext("Trim IR to windows", mpIndex + 2);
  title = title.replace("ilter", "inal");
  await fetchREW(mpIndex + 3, 'PUT', {title: title});
  await postDelete(mpIndex + 2);
  await postDelete(mpIndex);
  return mpIndex + 1;}
async function ttScore(index1, index2) {
  const [lowRange, highRange] = [17.68, 600];
  const startIndex = Math.round(Math.log2(lowRange / responseTarget.startFreq) * responseTarget.ppo);
  const endIndex = Math.round(Math.log2(highRange / responseTarget.startFreq) * responseTarget.ppo);
  const targetMag = Array.from({length: endIndex - startIndex + 1}, (_, i) => dataTarget.getFloat32((startIndex + i) * 4, false));
  const getSpeakerMag = async (index) => {
    const speakerResponse = await fetchSafe('frequency-response?smoothing=1%2F48&ppo=96', index);
    const dataSpeaker = new DataView(Uint8Array.from(atob(speakerResponse.magnitude), c => c.charCodeAt(0)).buffer);
    const sStartIndex = Math.round(Math.log2(lowRange / speakerResponse.startFreq) * speakerResponse.ppo);
    const sEndIndex = Math.round(Math.log2(highRange / speakerResponse.startFreq) * speakerResponse.ppo);
    return Array.from({length: sEndIndex - sStartIndex + 1}, (_, j) => dataSpeaker.getFloat32((sStartIndex + j) * 4, false));
  };
  const [speakerMag1, speakerMag2] = await Promise.all([getSpeakerMag(index1), getSpeakerMag(index2)]);
  const calculateArea = (speakerMag) => speakerMag.reduce((area, mag, idx) => area + Math.max(0, targetMag[idx] - mag), 0);
  const area1 = calculateArea(speakerMag1);
  const area2 = calculateArea(speakerMag2);
  return area1 < area2 ? index1 : index2;}
async function generateOCA() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const timestamp = `${year}${month}${day}_${hours}${minutes}`;
  let baseOca = {};
  baseOca.versionEvo = evoVersion;
  baseOca.tcName = tcName;
  baseOca.bassFill = bassFill;
  baseOca.softRoll = !isSoftRoll ? "None" : softRoll === true ? "Deactivated" : "Active";
  baseOca.softRoll = softRoll;
  baseOca.ocaTypeId = ocaTypeId;
  baseOca.ocaVersion = ocaVersion;
  baseOca.title = jsonContent.title;
  baseOca.model = jsonContent.targetModelName;
  baseOca.ifVersionMajor = ifVersionMajor;
  baseOca.ifVersionMinor = ifVersionMinor;
  baseOca.eqType = jsonContent.enMultEQType;
  baseOca.ampAssign = jsonContent.enAmpAssignType;
  baseOca.ampAssignBin = jsonContent.ampAssignInfo;
  baseOca.channels = jsonContent.detectedChannels.map(detectedChannel => {
    const commandIdIndex = commandId.indexOf(detectedChannel.commandId);
    const trimAdjustmentInDbs = customLevel[commandIdIndex];
    const distanceInMeters = customDistance[commandIdIndex];
    const filter = customFilter[commandIdIndex];
    let crossover = customCrossover[commandIdIndex];
    let speakerType = crossover === null ? "E" : (crossover < 40 ? "L" : "S");
    if (isLarge[commandIdIndex] === true) {speakerType = "L";}
    const channel = {
      channelType: detectedChannel.enChannelType,
      speakerType: speakerType,
      distanceInMeters: distanceInMeters,
      trimAdjustmentInDbs: trimAdjustmentInDbs,
      filter: filter
    };
    if (crossover != null) {channel.xover = crossover;}
    return channel;});
  baseOca.enableDynamicEq = true;
  baseOca.dynamicEqRefLevel = 0;
  baseOca.enableDynamicVolume = false;
  baseOca.dynamicVolumeSetting = 0;
  baseOca.enableLowFrequencyContainment = false;
  baseOca.lowFrequencyContainmentLevel = 3;
  baseOca.numberOfSubwoofers = nSubs;
  baseOca.subwooferOutput = LFE ? "LFE" : "L+M";
  baseOca.lpfForLFE = lpf4LFE;
  let jsonData = JSON.stringify(baseOca, null, 2);
  const blob = new Blob([jsonData], {type: 'application/json'});
  const urlBlob = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  downloadLink.href = urlBlob;
  const optName = `${timestamp}_A1EvoNeuron_${evoVersion}.oca`;
  downloadLink.download = optName;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  URL.revokeObjectURL(urlBlob);}
async function promptSaveLog() {
    function saveLogAsHTML() {
      const logContainer = document.getElementById("logContainer");
      const logText = logContainer ? logContainer.innerText : "No log available!";
      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Log File</title>
          <style>
            body {
              font-family: 'Poppins', 'Segoe UI', Roboto, sans-serif;
              line-height: 1.6;
              color: #333;
              margin: 20px;
            }
            pre {
              background: #f5f5f5;
              padding: 15px;
              border-radius: 6px;
              overflow-x: auto;
              white-space: pre-wrap;
              word-wrap: break-word;
            }
          </style>
        </head>
        <body>
          <h1>Log File</h1>
          <pre>${logText}</pre>
        </body>
        </html>
      `;
      const logBlob = new Blob([htmlContent], { type: 'text/html' });
      const logUrl = URL.createObjectURL(logBlob);
      const logLink = document.createElement("a");
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const timestamp = `${year}${month}${day}_${hours}${minutes}`;
      logLink.href = logUrl;
      logLink.download = `A1 Evo Neuron Log ${timestamp}.html`;
      logLink.click();
      URL.revokeObjectURL(logUrl);
    }
    const modalHtml = `
      <dialog style="
        background: linear-gradient(135deg, #2D3748, #4A5568);
        padding: 20px;
        border-radius: 10px;
        border: none;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        max-width: 800px;
        font-family: 'Poppins', 'Segoe UI', Roboto, sans-serif;
        font-size: 0.8rem;
        color: #E2E8F0;
        z-index: 3000; 
      ">
        <form method="dialog" style="margin: 0;">
          <h3 style="
            margin: 0 0 15px 0; 
            font-size: 1.5rem; 
            font-weight: bold; 
            color: #E2E8F0;
          ">
            Save Log File?
          </h3>
          <p style="
            margin-bottom: 20px; 
            line-height: 1.6; 
            color: #E2E8F0;
          ">
            The log file contains valuable information from this optimization session. Would you like to save it? The file will be named 
            <strong>'Nexus Finale Log [timestamp].html'</strong>.
          </p>
          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button type="submit" value="cancel" style="
              padding: 10px 20px; 
              border: none; 
              border-radius: 6px; 
              background: #4A5568; 
              color: #E2E8F0; 
              font-size: 0.8rem; 
              cursor: pointer; 
              transition: background 0.2s ease;
            ">
              Cancel
            </button>
            <button type="submit" value="confirm" style="
              padding: 10px 20px; 
              border: none; 
              border-radius: 6px; 
              background: #2B6CB0; 
              color: #E2E8F0; 
              font-size: 0.8rem; 
              font-weight: bold; 
              cursor: pointer; 
              transition: background 0.2s ease;
            ">
              Save
            </button>
          </div>
        </form>
      </dialog>
    `;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = modalHtml;
    const dialog = wrapper.querySelector('dialog');
    const styleElem = document.createElement('style');
    styleElem.innerHTML = `
      dialog::backdrop {
        background: rgba(0, 0, 0, 0.6); 
        backdrop-filter: blur(2px);
      }
    `;
    document.head.appendChild(styleElem);
    document.body.appendChild(dialog);
    dialog.showModal();
    const result = await new Promise(resolve => {
      dialog.addEventListener('close', () => {
        const returnValue = dialog.returnValue;
        resolve(returnValue === 'confirm');
        dialog.remove();
      });
    });

    if (result) {
      saveLogAsHTML();
    } else {
      console.log("Log save canceled by user!");
    }}
// BOOT
document.addEventListener("DOMContentLoaded", () => {
  const isWindows = navigator.platform.toUpperCase().indexOf('WIN') >= 0;
  folderPath = window.location.pathname.replace(/\/[^\/]*$/, '');
  folderPath = decodeURIComponent(folderPath);
  if (isWindows && folderPath.startsWith('/')) {
    folderPath = folderPath.slice(1);
  }
  const instructionText = document.getElementById("instructionText");
  instructionText.innerHTML = `
    To create a new configuration file (<strong>.avr</strong>), simply double-click<br>
    "<strong>odd.wtf Menu.bat</strong>"<br>
    located in: <strong>${folderPath}</strong>
`;});
document.getElementById('fileInput').addEventListener('change', function(event) {
  const file = event.target.files[0];
  if (file) {
    jsonName = file.name;
    jsonType = jsonName.split('.').pop();
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        jsonContent = JSON.parse(e.target.result);
        readContents();
        const uploadOverlay = document.getElementById('uploadOverlay');
        uploadOverlay.parentNode.removeChild(uploadOverlay);
        const measurementChoice = document.getElementById('measurementChoice');
        measurementChoice.classList.remove('hidden');
      } catch (error) {
        console.error("Error parsing file, please upload a valid '.avr' configuration file!");
        throwError();
      }
    };
    reader.readAsText(file);
    console.info(`Uploaded configuration/calibration file: ${jsonName}`);
}});
document.addEventListener('DOMContentLoaded', () => {
  window.maxBoost = 5;
  window.bassFill = 0;
  window.disableInversion = true;
  window.sameXover = false
  document.getElementById('maxBoostSlider').addEventListener('input', function (e) {
    const normalizedValue = e.target.value.replace(',', '.');
    window.maxBoost = parseFloat(normalizedValue);
    if (!isNaN(window.maxBoost)) {
      document.getElementById('maxBoostValue').textContent = window.maxBoost + ' dB';
      console.infoUpdate(`Filter boost value (dB): ${window.maxBoost}`);
    } else {
       console.error(`Invalid input: ${e.target.value}`);
    }
  });
  document.getElementById('bassFillSlider').addEventListener('input', function (e) {
    const normalizedValue = e.target.value.replace(',', '.');
    window.bassFill = parseFloat(normalizedValue);
    if (!isNaN(window.bassFill)) {
      document.getElementById('bassFillValue').textContent = window.bassFill + ' dB';
      console.infoUpdate(`Subwoofer fill value (dB): ${window.bassFill}`);
    } else {
       console.error(`Invalid input: ${e.target.value}`);
    }
  });
  document.getElementById('removeSoftRoll').addEventListener('change', function (event) {
    window.softRoll = event.target.checked;
    console.infoUpdate(`SoftRoll removed? ${window.softRoll}`);
  });
  document.getElementById('disableSpeakerInversion').checked = true;
  document.getElementById('disableSpeakerInversion').addEventListener('change', function (event) {
    window.disableInversion = event.target.checked;
    console.infoUpdate(`Automatic speaker inversion disabled? ${window.disableInversion}`);
  });
  document.getElementById('forceLargeFronts').addEventListener('change', function (event) {
    window.forceLarge = event.target.checked;
    const identicalXovers = document.getElementById('identicalXovers');
    identicalXovers.checked = false;
    //identicalXovers.disabled = event.target.checked;
    window.sameXover = false;
    console.infoUpdate(`LFE + Main forced? ${window.forceLarge}`);
  });
  document.getElementById('identicalXovers').addEventListener('change', function (event) {
    window.sameXover = event.target.checked;
    const forceLargeFronts = document.getElementById('forceLargeFronts');
    if (!forceLargeFronts.disabled) {
        forceLargeFronts.checked = false;
        //forceLargeFronts.disabled = event.target.checked;
        window.forceLarge = false;
    }
    console.infoUpdate(`All crossovers are at the same frequency? ${window.sameXover}`);
  });});
function triggerFileInput(){document.getElementById('fileInput').click();}
async function extractMeasurements() {
  let jName, jType, jData;
  const input = document.createElement('input');
   input.type = 'file';
   input.accept = '.ady, .mqx';
   const file = await new Promise((resolve) => {
     input.addEventListener('change', function (event) {
       resolve(event.target.files[0]);
     });
     input.click();
   });
   if (!file) {
     console.info('No file selected.');
     return;
   }
    jName = file.name;
    jType = jName.split('.').pop();
   console.info(`Extracting measurements from the ${jName}...`);
   try {
     jData = await inputFile(file);
   } catch (error) {
     console.error(error.message);
     throwError();
   }
  let inv_micCal, rewHeader;
  if (isCirrusLogic || jType === "mqx") {
      console.info(`Applying AC1HB microphone calibration adjustment to each measurement...`);
      let perfectResponse = [1, ...Array(16383).fill(0)];
      inv_micCal = vectorDivide(perfectResponse, micCalFile);
      rewHeader = `* Impulse Response data saved by REW\n0 // Peak value before normalisation\n0 // Peak index\n16384 // Response length\n2.0833333333333333E-5 // Sample interval (seconds)\n0.0 // Start time (seconds)\n95.0 // Data offset (dB)\n* Data start\n`;
  } else {
      rewHeader = `* Impulse Response data saved by REW\n0 // Peak value before normalisation\n0 // Peak index\n16384 // Response length\n2.0833333333333333E-5 // Sample interval (seconds)\n0.0 // Start time (seconds)\n75.0 // Data offset (dB)\n* Data start\n`;
  }
  const zip = new JSZip();
  let totalMeasurements = 0;
  let hasSubwoofer = false;
  const processMeasurements = async () => {
    const measurementProcessors = {
      ady: async () => {
        const {detectedChannels} = jData;
        const promises = Object.entries(detectedChannels).flatMap(([key, detectedChannel]) => {
          const {responseData, commandId} = detectedChannel;
          if (commandId && commandId.startsWith("SW")) {
            hasSubwoofer = true;
          }
          return Object.entries(responseData).map(async ([arrayKey, arrayData]) => {
            try {
              let dataString = isCirrusLogic 
                ? (await fastConvolution(arrayData, inv_micCal)).join('\n')
                : arrayData.join('\n');
              const measurementName = `${commandId}${arrayKey}.txt`;
              zip.file(measurementName, `${rewHeader}${dataString}`);
              totalMeasurements++;
            } catch (error) {
              console.error(`Error processing ${commandId}${arrayKey}:`, error);
              throwError();
            }
          });
        });
        await Promise.all(promises.flat());
      },
      mqx: async () => {
        const {_measurements: measurements, _channelDataMap, CalibrationSettings} = jData;
        const {DistancePoisitionGuid, TrimPositionGuids} = CalibrationSettings;
        const positionIndices = {};
        let globalIndex = 1;
        const subwooferMap = {
          SW1: ["SWF", "SWL", "SWFL"],
          SW2: ["SWR", "SWFR", "SWB"],
          SW3: ["SWBL"],
          SW4: ["SWBR"],
        };
        const tempSubMap = {};
        measurements.forEach((measurement) => {
          const {ChannelGuid} = measurement;
          const avrOriginatingDesignation = _channelDataMap[ChannelGuid]?.Metadata?.AvrOriginatingDesignation || "";
          if (avrOriginatingDesignation.startsWith("SW")) {
            for (const [swKey, aliases] of Object.entries(subwooferMap)) {
              if (aliases.includes(avrOriginatingDesignation)) {
                tempSubMap[avrOriginatingDesignation] = swKey;
              }
            }
          }
        });
        const allSWChannels = Object.keys(tempSubMap);
        if (allSWChannels.includes("SWB")) {
          if (allSWChannels.includes("SWF") && !allSWChannels.includes("SWR")) {
            tempSubMap["SWB"] = "SW2";
          } else if (allSWChannels.includes("SWFL") && allSWChannels.includes("SWFR")) {
            tempSubMap["SWB"] = "SW3";
          }
        }
        const zipTasks = measurements.map(async (measurement) => {
          try {
            const {Data, PositionGuid, ChannelGuid} = measurement;
            let avrOriginatingDesignation = _channelDataMap[ChannelGuid]?.Metadata?.AvrOriginatingDesignation || "Unknown";
            if (avrOriginatingDesignation.startsWith("SW")) {
              avrOriginatingDesignation = tempSubMap[avrOriginatingDesignation] || avrOriginatingDesignation;
              hasSubwoofer = true;
            }
            const bytes = Uint8Array.from(atob(Data), (c) => c.charCodeAt(0));
            const dataView = new DataView(bytes.buffer);
            const floats = Array.from({ length: bytes.length / 4 }, (_, i) => dataView.getFloat32(i * 4, true));
            let positionIndex;
            const isZeroGuid = DistancePoisitionGuid === "00000000-0000-0000-0000-000000000000";
            if ((!isZeroGuid && PositionGuid === DistancePoisitionGuid) || 
                (isZeroGuid && PositionGuid === TrimPositionGuids[0])) {
              positionIndex = 0;
            } else if (positionIndices[PositionGuid] !== undefined) {
              positionIndex = positionIndices[PositionGuid];
            } else {
              positionIndex = globalIndex++;
              positionIndices[PositionGuid] = positionIndex;
            }
            const filename = `${avrOriginatingDesignation}${positionIndex}.txt`;
            const dataString = (await fastConvolution(floats, inv_micCal)).join('\n');
            zip.file(filename, `${rewHeader}${dataString}`);
            totalMeasurements++;
          } catch (error) {
            console.error(`Failed to process measurement with ChannelGuid: ${measurement.ChannelGuid}`, error);
            throwError();
          }
        });
        await Promise.all(zipTasks);
      }
    };
    await measurementProcessors[jType]();
    if (!hasSubwoofer) {
      throw new Error("No subwoofer in the uploaded calibration file. A1 Evo cannot optimize systems without a subwoofer!");
    }};
  await processMeasurements();
  console.info(`Created a zip file with ${totalMeasurements} total measurements. Double click on the zip file, select all with 'CTRL + A' ('⌘ + A' on Macs), drag & drop contents into REW and 'Save all' them`);
  const content = await zip.generateAsync({type: 'blob'});
  const urlZip = URL.createObjectURL(content);
  const downloadLink = document.createElement('a');
  downloadLink.href = urlZip;
  downloadLink.download = `${jName.substring(0, jName.lastIndexOf('.'))}_extractedMeasurements.zip`;
  downloadLink.style.display = 'none';
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  URL.revokeObjectURL(urlZip);
  if (typeof(inv_micCal) !== "undefined") {inv_micCal.length = 0;}}
async function inputFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = JSON.parse(e.target.result);
        resolve(data);
      } catch (error) {
        reject(new Error('Error parsing JSON: ' + error.message));
      }
    };
    reader.onerror = function () {
      reject(new Error('Error reading file: ' + reader.error.message));
    };
    reader.readAsText(file);
  });}
function readContents(){
  const modelsSoS300 = [ "-S720W", "-S920W", "X1300W", "X2300W", "X3300W", "NR1607", "SR5011", "SR6011", "C-A110", "X3700H", "X4700H","X6500H", "X6700H",
                         "X8500H", "R-A110", "-S730H", "-S740H", "-S750H", "-S760H", "-S930H", "-S940H", "-S950H", "-S960H", "X1400H", "X1500H", "X1600H",
                         "X1700H", "X2400H", "X2500H", "X2600H", "X2700H", "X3400H", "X3500H", "X3600H", "X3700H", "X4300H", "X4400H", "X4500H", "X4700H",
                         "X6300H", "X6400H", "X6500H", "X6700H", "X8500H", "AV7703", "AV7704", "AV7705", "AV7706", "AV8805", "NR1608", "NR1609", "NR1710",
                         "NR1711", "SR5012", "SR5013", "SR5014", "SR5015", "SR6012", "SR6013", "SR6014", "SR6015", "SR7011", "SR7012", "SR7013", "SR7015",
                         "SR8012", "SR8015" ];
  const modelsCirrusLogic = [ "-S720W", "-S920W", "X1300W", "X2300W", "X3300W", "NR1607", "SR5011", "-S730H", "-S740H", "-S750H", "-S760H", "-S930H", "-S940H", "-S950H",
                              "-S960H", "X1400H", "X1500H", "X1600H", "X1700H", "X2400H", "X2500H", "X2600H", "X2700H", "X3400H", "X3500H", "X3600H", "NR1608", "NR1609",
                              "NR1710", "NR1711", "SR5012", "SR5013", "SR5014", "SR5015", "SR6013", "SR6014", "-S770H", "-S970H", "X1800H", "X2800H", "EMA 60", "MA 70s" ];
  const modelsNo180xo = [ "-S720W", "-S920W", "X1300W", "X2300W", "X3300W", "NR1607", "SR5011", "SR6011", "X6500H", "-S730H", "-S740H", "-S930H", "-S940H",
                          "X1400H", "X1500H", "X2400H", "X2500H", "X3400H", "X3500H", "X4300H", "X4400H", "X4500H", "X6300H", "X6400H", "X6500H", "AV7703",
                          "AV7704", "AV7705", "NR1608", "NR1609", "SR5012", "SR5013", "SR6012", "SR6013", "SR7011", "SR7012", "SR7013", "SR8012" ];
  const baseFreq = [40, 60, 80, 90, 100, 110, 120, 150, 200, 250];
  const extraFreq = 180;
  const modelName = jsonContent.targetModelName;
  console.info(`Target AV receiver model: ${modelName}`);
  /*if (jsonContent.enMultEQType < 1) {
    console.error(`${modelName} doesn't have MultEQ XT or XT32 and is not YET compatible with A1 Evo Neuron. Please try again when the feature is added!`);
    throwError();
  }*/
  const toggleButton = document.getElementById('forceLargeFronts');
  if (jsonContent.enMultEQType != 2) {
      xt32 = false;
      xt = (jsonContent.enMultEQType == 1);
      console.log(`MultEQ Type:: ${jsonContent.enMultEQType === 1 ?
        'XT (sub filter: 4096 samples / 512 taps, speaker filter: 512 samples / 512 taps)' :
        'Basic (sub filter: 4096 samples / 512 taps, speaker filter: 128 samples / 128 taps)'}`);
      toggleButton.checked = false;
      toggleButton.disabled = true;
      forceLarge = false;
  } else {
      console.log('MultEQ Type:: XT32 (sub filter: 16055 samples / 704 taps, speaker filter: 16321 samples / 1024 taps)');
      toggleButton.checked = true;
      toggleButton.disabled = false;
      forceLarge = true;
  }
  const model = modelName.slice(-6);
  isSoftRoll = modelName.includes("NR") || modelName.includes("SR") || modelName.includes("AV7") || modelName.includes("AV8") || modelName.includes("AV1") || modelName.includes("CINEMA");
  isDacFilter = modelName.includes("AV10") || modelName.includes("CINEMA 30");
  sOs = modelsSoS300.includes(model) ? 300.00 : 343.00;
  minDistAccuracy = 3.0 / 100 / sOs / 2;
  isCirrusLogic = modelsCirrusLogic.includes(model);
  freqIndex = [...baseFreq];
  const no180 = modelsNo180xo.includes(model);
  if (!no180) {freqIndex.splice(8, 0, extraFreq)}
  distFL = parseFloat(jsonContent.detectedChannels[1].channelReport.distance);
  if (isNaN(distFL) || distFL === 0) {
    distFL = parseFloat(jsonContent.detectedChannels[1].customDistance);
    if (isNaN(distFL) || distFL === 0 || distFL === null) {
      distFL = 3.0;
    }
  }
  console.info(`Model specific speed of sound setting: ${sOs} m/s`);
  console.info(`Model is capable of setting 180Hz crossover: ${!no180}`);
  console.info(`Model has Cirrus Logic DSP chip: ${isCirrusLogic}`);
  if (isDacFilter) {
    console.info(`Model has switchable DAC filter: ${isDacFilter}`);
    console.info(`'DAC filter' should be set to 'Filter 2' for correct high frequency reproduction, otherwise use 'remove soft roll' optimization option if you are not a fan of 'the' Marantz sound!`);
  } else if (isSoftRoll) {
    console.info(`Model has DAC with high frequency soft roll: ${isSoftRoll} - use 'Remove soft roll-off' optimization option if you are not a fan of 'the' Marantz sound!`);
  }
  const toggleButton2 = document.getElementById('removeSoftRoll');
  if (!isDacFilter && !isSoftRoll) {
    softRoll = false;
    toggleButton2.checked = false;
    toggleButton2.disabled = true;
  } else {
    toggleButton2.disabled = false;
    softRoll = true;
    toggleButton2.checked = true;
  }}
async function checkREW() {
  try {
    await postSafe(`http://localhost:4735/eq/default-equaliser`, {manufacturer: "Generic", model: "Generic"}, "Default equaliser changed");
  } catch (error) {
    console.error("Error while setting default equaliser. Please ensure the REW API server is running.");
    throwError("Could not connect to the REW API server. Please start it from 'REW/Preferences/API/Start server' and try again.");
  }
  let dontStart = true, reTry = 10, versionString;
  do {
    try {
      const rewVersionResponse = await fetch(`http://localhost:4735/version`);
      if (rewVersionResponse.ok) {
        const rewData = await rewVersionResponse.json();
        versionString = rewData.message;
        const versionMatch = versionString.match(/(\d+)\.(\d+)\sBeta\s(\d+)/);
        const major = parseInt(versionMatch[1], 10);
        const minor = parseInt(versionMatch[2], 10);
        const beta = parseInt(versionMatch[3], 10);
        const versionOK = major > 5 || (major === 5 && minor > 40) || (major === 5 && minor === 40 && beta >= 66);
        if (!versionOK) {
          console.error(`Installed REW version (${versionString}) is outdated and incompatible with A1 Evo! Please install the latest REW Beta from https://www.avnirvana.com/threads/rew-api-beta-releases.12981/.`);
          throwError();
        }
      } else {
        console.warn(`REW API server is not responding. Retrying in ${reTry} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, reTry * 1000));
        reTry = (reTry % 5) + 1;
        continue;
      }
      const measurements = await fetchREW();
      const emptyMeasurements = !measurements || Object.keys(measurements).length === 0;
      rewMaxLimit = await fetchSafe('max-measurements');
      const limitExceeded = rewMaxLimit < 200;
      const tcResponse = await fetch('http://localhost:4735/eq/house-curve');
      const target = tcResponse.ok ? await tcResponse.json() : null;
      targetCurvePath = target?.message;
      const missingTargetCurve = !target || !targetCurvePath;
      if (emptyMeasurements || limitExceeded || missingTargetCurve) {
        if (emptyMeasurements) {
          console.warn(`No measurements in REW. Please load measurements. Retrying in ${reTry} seconds...`);
        }
        if (limitExceeded) {
          console.warn(`Max number of measurements REW can handle is set too low (${rewMaxLimit}). Please set it to 200 or above (limit 1000) in "REW/Preferences/View/Maximum measurements". Retrying in ${reTry} seconds...`);
        }
        if (missingTargetCurve) {
          console.warn(`Target curve not found. Please upload your preferred target curve under "REW/EQ/Target settings/House curve". Retrying in ${reTry} seconds...`);
        }
        await new Promise((resolve) => setTimeout(resolve, reTry * 1000));
        reTry = (reTry % 5) + 3;
      } else {
        dontStart = false;
      }
    } catch (error) {
      console.warn(`Error connecting to REW API server: ${error.message}`);
      console.warn(`Please start the API server from "REW/Preferences/API/Start server". Retrying in ${reTry} seconds...`);
      await new Promise((resolve) => setTimeout(resolve, reTry * 1000));
      reTry = (reTry % 5) + 1;
    }
  } while (dontStart);
  console.info(`Using REW version: ${versionString}`);
  console.info(`Total number of measurements allowed in REW: ${rewMaxLimit}`);
  console.info(`Optimizing for user uploaded target curve: ${targetCurvePath}`);
  console.info(`Active optimizer: A1 Evo Neuron ${evoVersion}`);}
async function checkOrigin(){
  const response = await fetchSafe('impulse-response', 1);
  const bytes = Uint8Array.from(atob(response.data), c => c.charCodeAt(0));
  const totalSamples = bytes.length / 4;
  return (totalSamples < 32768);}
async function fixSubs4REW() {
  console.info(`Reversing 'Linkwitz Riley 250Hz 24dB/octave lowpass filter' applied by the AVR to REW subwoofer measurements...`);
  const fileName = `fixSW250HzLPF.mdat`;
  const fullPath = `${folderPath}/${fileName}`;
  try {
    await postSafe(`http://localhost:4735/measurements/command`, { command: 'Load', parameters: [fullPath] }, `Load`);
  } catch (error) {
    console.error(`Error: Could not load file "${fileName}". Please ensure the file exists in the specified folder: ${folderPath}`);
    console.error(`Detailed error:`, error);
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, speedDelay * 2));
  try {
    let allResponses = await fetchREW();
    const subFix = Object.keys(allResponses).length;
    let measurementArray = Object.keys(allResponses).map((key) => ({
      index: parseInt(key, 10),
      title: allResponses[key].title,
    }));
    const indicesToDelete = [];
    for (let i = 1; i < measurementArray.length; i++) {
      const {index, title} = measurementArray[i];
      if (title.startsWith("SW")) {
        const fixedSub = await postNext('Arithmetic', [index, subFix], {function: "A * B"});
        await new Promise((resolve) => setTimeout(resolve, speedDelay));
        const subKey = parseInt(Object.keys(fixedSub.results)[0], 10);
        await fetchREW(subKey, 'PUT', {title: title});
        indicesToDelete.push(index);
      }
    }
    await postDelete(subFix);
    for (let i = indicesToDelete.length - 1; i >= 0; i--) {
      await postDelete(indicesToDelete[i]);
    }
    console.info(`All subwoofer measurements corrected!`);
  } catch (error) {
    console.error(`An error occurred while processing measurements:`, error);
  }}
async function checkPrePro() {
  const first = await fetchREW(1);
  const note = first.notes;
  return note === 'pre-processsed measurement';}
async function checkAutomatedMeasurements(){
  console.info(`Checking consistency of imported measurements...`);
  let allResponses = await fetchREW();
  const titleIndices = {};
  let nTotal = Object.keys(allResponses).length;
  if (nTotal > 500) {
    console.error(`Neuron cannot process more than 500 measurements at this time. You will need to delete some of the mic positions and restart optimization!`);
    throwError();
  }
  if ((nTotal * 2) > rewMaxLimit) {
    console.warn(`You need to increase maximum measurement limit to at least ${nTotal * 2} in REW/Preferences for Neuron to be able to process all these measurements!`);
    throwError();
  }
  let totalSpeakers = 0;
  let totalSubs = 0;
  for (let i = 1; i <= nTotal; i++) {
    const title = allResponses[i].title;
    if (title.startsWith('SWMIX')) standardBassError();
    if (title.startsWith('SW')) {
      const subNum = parseInt(title[2], 10);
      if (subNum < 1 || subNum > 4) {
        console.error(`Unexpected sub number in title: ${title}`);
        throwError();
      }
      const measurementIndexPart = title.slice(3);
      const measurementIndex = parseInt(measurementIndexPart, 10);
      const baseTitle = 'SW' + subNum;
      if (!titleIndices[baseTitle]) {
          titleIndices[baseTitle] = [];
          totalSubs++;
      }
      titleIndices[baseTitle].push(measurementIndex);
    } else {
      const speakerName = title.replace(/\d+$/, '');
      const indexPart = title.match(/(\d+)$/);
      if (!indexPart) {
          console.error(`Speaker measurement '${title}' is missing an index`);
          throwError();
      }
      if (!titleIndices[speakerName]) {
          titleIndices[speakerName] = [];
          totalSpeakers++;
      }
      titleIndices[speakerName].push(parseInt(indexPart[0], 10));
    }
  }
  for (const [name, indices] of Object.entries(titleIndices)) {
    if (!indices.includes(0)) {
      console.error(`Measurement for main listening position (index 0) is missing for ${name}. Optimization cannot proceed without it!`);
      throwError();
    }
  }
  const numberOfIndices = Object.values(titleIndices).map(indices => indices.length);
  const firstLength = numberOfIndices[0];
  if (!numberOfIndices.every(length => length === firstLength)) {
    const inconsistentSpeakers = Object.entries(titleIndices)
      .filter(([_, indices]) => indices.length !== firstLength)
      .map(([name, indices]) => `${name} (${indices.length} measurements)`)
      .join(', ');
    const hasMissingIndices = numberOfIndices.some(length => length < firstLength);
    const hasExtraIndices = numberOfIndices.some(length => length > firstLength);
    if (hasMissingIndices) {
      console.warn(`Some measurements seem to have been removed from REW. ${inconsistentSpeakers} vs ${firstLength} measurements in others.`);
      console.warn(`If this was NOT intentional, you should reload your original automated measurement results to REW and restart optimization!`);
      console.warn(`** If you have used 'subwoofer cable swap method' for measuring your subs, you can safely ignore above warnings **`);
    }
    if (hasExtraIndices) {
      console.warn(`Expected ${firstLength} measurements but found extra counts in: ${inconsistentSpeakers}`);
      console.warn(`If this was NOT intentional, you should reload your original automated measurement results to REW and restart optimization!`);
    }
  }
  console.info(`Preparing measurement layout for optimization...`);
  function naturalStringCompare(a, b) {
     return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  }
  allResponses = await fetchREW();
  let measurementArray = Object.keys(allResponses)
    .map(key => ({
      index: parseInt(key),
      title: allResponses[key].title
    }));
  measurementArray.sort((a, b) => {
    const specialNames = ["C", "FD", "BD", "SD", "FH", "CH"];
    const titleA = a.title;
    const titleB = b.title;
    const isSpecialA = specialNames.some(name => titleA.startsWith(name));
    const isSpecialB = specialNames.some(name => titleB.startsWith(name));
    const isSWA = titleA.startsWith("SW");
    const isSWB = titleB.startsWith("SW");
    if (isSWA && !isSWB) return 1;
    if (isSWB && !isSWA) return -1;
    if (isSpecialA && !isSpecialB) return 1;
    if (isSpecialB && !isSpecialA) return -1;
    if (isSWA && isSWB) {
      const subA = parseInt(titleA[2], 10);
      const subB = parseInt(titleB[2], 10);
      if (subA !== subB) return subA - subB;
      const measA = parseInt(titleA.slice(3), 10) || 0;
      const measB = parseInt(titleB.slice(3), 10) || 0;
      return measA - measB;
    }
    if (isSpecialA && isSpecialB) {
      return naturalStringCompare(titleA, titleB);
    }
    return naturalStringCompare(titleA, titleB);
  });
  let newIndex = nTotal + 1;
  for (const measurement of measurementArray) {
    const {index, title} = measurement;
    await postSafe(`${baseUrl}/${index}/command`, {command: "Response copy"}, "Completed");
    await fetchREW(newIndex, 'PUT', {title: title});
    newIndex++;
  };
  for (let i = nTotal; i >= 1; i--) {
    console.infoUpdate(`Clean up in progress...${(100 - (i - 1) / nTotal * 100).toFixed(2)}%`);
    await postDelete(i);
  }
  const title = measurementArray[measurementArray.length - 1].title;
  const match = title.match(/^SW(\d)/);
  const numSub = parseInt(match[1], 10);
  if (numSub < jsonContent.subwooferNum) standardBassError();
  function standardBassError() {
    console.warn(`Imported measurements in REW are missing data for each of the ${jsonContent.subwooferNum} subwoofers in your system!`);
    if (isCirrusLogic) {
      console.warn(`Try manually measuring each of your subwoofers with REW and a calibration microphone or use 'odd.wtf measure -s' tool with subwoofer RCA cable swapping method.`);
    } else {
        if (sOs === 343) {
          console.warn(`Repeat measurement process with your receiver in 'directional bass' mode. You can use 'odd.wtf measure' tool.`);
        } else {
          console.warn(`Repeat measurement process with 'odd.wtf measure -b' 'directional bass' mode hack (will work with your reciever model).`);
        }
    }
    console.error(`A1 Evo Neuron cannot optimize your system without individual measurements for each subwoofer!`);
    throwError();
  }}
async function checkRewMeasurements(){
  function naturalStringCompare(a, b) {
     return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  }
  let firstSWIndex = jsonContent.detectedChannels.findIndex(ch => ch.commandId.startsWith("SW"));
  if (firstSWIndex !== -1) {
    let swCount = 1;
    let chType;
    if (jsonContent.enMultEQType < 2) {
        jsonContent.detectedChannels[firstSWIndex].commandId = `SW1`;
        chType = parseInt(jsonContent.detectedChannels[firstSWIndex].enChannelType);
        jsonContent.detectedChannels[firstSWIndex].enChannelType = chType;
    } else {
        chType = 54;
        for (let i = firstSWIndex; i < jsonContent.detectedChannels.length; i++) {
            jsonContent.detectedChannels[i].commandId = `SW${swCount}`;
            jsonContent.detectedChannels[i].enChannelType = chType;
            swCount++;
            chType++;
        }
    }
  } else {
      console.error("No subwoofers detected in the uploaded configuration file. A1 Evo cannot optimize systems with no subwoofers!");
      throwError();
  }
  console.info(`Organizing measurements in REW...`)
  const configuredSpeakers = Object.entries(jsonContent.detectedChannels)
      .map(([_, channel]) => channel.commandId)
      .filter(id => id);
  const subwooferCount = configuredSpeakers.filter(name => name.startsWith('SW')).length;
  const allowedNames = new Set([
      ...configuredSpeakers.filter(name => !name.startsWith('SW')),
      ...Array.from({length: subwooferCount}, (_, i) => `SW${i + 1}`)
  ]);
  let allResponses = await fetchREW();
  let nTotal = Object.keys(allResponses).length;
   if (nTotal > 500) {
    console.error(`Neuron cannot process more than 500 measurements at this time. You will need to delete some of the mic positions and restart optimization!`);
    throwError();
  }
  if ((nTotal * 2) > rewMaxLimit) {
    console.error(`You need to increase maximum measurement limit to at least ${nTotal * 2} in REW/Preferences for Neuron to be able to process all these measurements!`);
    throwError();
  }
  let measurementArray = Object.keys(allResponses).map(key => ({
      index: parseInt(key),
      title: allResponses[key].title
  }));
  let invalidNames = [];
  let foundNames = new Set();
  for (let measurement of measurementArray) {
    const title = measurement.title;
    let matchedName;
    if (
      allowedNames.has("CH") &&
      (title === "CH" || title.startsWith("CH ") || title.match(/^CH\d+$/))) {
      matchedName = "CH";
    } else {
      matchedName = Array.from(allowedNames).find((name) => title.startsWith(name) || (name.startsWith("SW") && title.match(new RegExp(`^${name}\\d*$`))));
    }
    if (!matchedName) {
      invalidNames.push(title);
    } else {
      foundNames.add(matchedName);
    }
  }
  const missingNames = Array.from(allowedNames).filter(name => !foundNames.has(name));
  if (invalidNames.length > 0 || missingNames.length > 0) {
      let errorMsg = [];
      if (invalidNames.length > 0) {errorMsg.push("Invalid measurement names detected:\n" + invalidNames.join("\n"));}
      if (missingNames.length > 0) {errorMsg.push("Missing measurements for the following speakers:\n" + missingNames.join("\n"));}
      if (errorMsg.length > 0) {console.error(errorMsg.join("\n\n")); throwError();}
  }
  const nameCounts = {};
  for (const measurement of measurementArray) {
    const {index, title} = measurement;
    if (allowedNames.has('CH') && (title === 'CH' || title.startsWith('CH ') || /^CH\d+$/.test(title))) {
      if (!nameCounts['CH']) {nameCounts['CH'] = 0;}
      const newTitle = `CH${nameCounts['CH'] === 0 ? '0' : nameCounts['CH']}`;
      await fetchREW(index, 'PUT', {title: newTitle});
      nameCounts['CH']++;
      continue;
    }
    for (const name of allowedNames) {
      if (title.startsWith(name)) {
        if (!nameCounts[name]) {nameCounts[name] = 0;}
        const newTitle = `${name}${nameCounts[name] === 0 ? '0' : nameCounts[name]}`;
        await fetchREW(index, 'PUT', {title: newTitle});
        nameCounts[name]++;
        break;
      }
    }
  }
  console.info(`Total measurements to process => ${nTotal} :`);
  for (const [name, count] of Object.entries(nameCounts)) {
      console.info(`${name} => ${count}`);
  }
  allResponses = await fetchREW();
  measurementArray = Object.keys(allResponses).map(key => ({
    index: parseInt(key),
    title: allResponses[key].title
  }));
  measurementArray.sort((a, b) => {
    const specialNames = ["C", "FD", "BD", "SD", "FH", "CH"];
    const titleA = a.title;
    const titleB = b.title;
    const isSpecialA = specialNames.some(name => titleA.startsWith(name));
    const isSpecialB = specialNames.some(name => titleB.startsWith(name));
    const isSWA = titleA.startsWith("SW");
    const isSWB = titleB.startsWith("SW");
    if (isSWA && !isSWB) return 1;
    if (isSWB && !isSWA) return -1;
    if (isSpecialA && !isSpecialB) return 1;
    if (isSpecialB && !isSpecialA) return -1;
    if (isSWA && isSWB) {
      const subA = parseInt(titleA[2], 10);
      const subB = parseInt(titleB[2], 10);
      if (subA !== subB) return subA - subB;
      const measA = parseInt(titleA.slice(3), 10) || 0;
      const measB = parseInt(titleB.slice(3), 10) || 0;
      return measA - measB;
    }
    if (isSpecialA && isSpecialB) {
      return naturalStringCompare(titleA, titleB);
    }
    return naturalStringCompare(titleA, titleB);
  });
  if (nTotal > 30) {
    try {
      await postNext("Trim IR to windows", 1);
    } catch (error) {
      console.info(`Sorting measurements...`);
      await new Promise((resolve) => setTimeout(resolve, speedDelay * 120));
    }
    await postDelete(nTotal + 1);
  }
  let newIndex = nTotal + 1;
  for (let i = 0; i < measurementArray.length; i++) {
    const measurement = measurementArray[i];
    const {index, title} = measurement;
    await postNext("Trim IR to windows", index);
    await new Promise((resolve) => setTimeout(resolve, speedDelay / 5));
    const progress1 = ((i + 1) / measurementArray.length) * 100;
    console.infoUpdate(`${progress1.toFixed(2)}% completed`);
    await fetchREW(newIndex, 'PUT', {title: title});
    newIndex++;
  }
  await new Promise((resolve) => setTimeout(resolve, speedDelay));
  for (let j = nTotal; j >= 1; j--) {
    await postDelete(j);
    await new Promise((resolve) => setTimeout(resolve, speedDelay / 5));
    const progress2 = ((nTotal - j + 1) / nTotal) * 100;
    console.infoUpdate(`Clean up ${progress2.toFixed(2)}% completed`);
  }}
async function resetAll(){
  let allResponses = await fetchREW();
  let nTotal = Object.keys(allResponses).length;
  for (let i = 1; i <= nTotal; i++) {
    console.infoUpdate(`Resetting IR windows, smoothing, EQ type, target shape and room curve settings...${(i / nTotal * 100).toFixed(2)}%`);
    await postNext('Smooth', i, {smoothing: "None"});
    await new Promise((resolve) => setTimeout(resolve, speedDelay / 10));
    await postSafe(`${baseUrl}/${i}/ir-windows`, {leftWindowType: "Rectangular", rightWindowType: "Rectangular", addFDW: false}, "Update processed");
    await new Promise((resolve) => setTimeout(resolve, speedDelay / 10));
    await postSafe(`${baseUrl}/${i}/target-settings`, {shape: "None"}, "Update processed");
    await new Promise((resolve) => setTimeout(resolve, speedDelay / 10));
    await postSafe(`${baseUrl}/${i}/room-curve-settings`, {addRoomCurve: false}, "Update processed");
    await new Promise((resolve) => setTimeout(resolve, speedDelay / 10));
    await postSafe(`${baseUrl}/${i}/equaliser`, {manufacturer: "Generic", model: "Generic"}, "Equaliser selected");
    await new Promise((resolve) => setTimeout(resolve, speedDelay / 10));
  }}
// SIGNAL MATH
function vectorSum(responseA, responseB){
  const base64ToFloat32Array = (base64) => {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const dataView = new DataView(bytes.buffer);
    return Array.from({length: bytes.length / 4}, (_, k) => dataView.getFloat32(k * 4, false));
  };
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const toLinear = (dB) => Math.pow(10, dB / 20);
  const [magA, phaseA] = [responseA.magnitude, responseA.phase].map(base64ToFloat32Array);
  const [magB, phaseB] = [responseB.magnitude, responseB.phase].map(base64ToFloat32Array);
  const sumMagnitudes = [];
  for (let i = 0; i < magA.length; i++) {
    const linearMagA = toLinear(magA[i]);
    const linearMagB = toLinear(magB[i]);
    const aReal = linearMagA * Math.cos(toRadians(phaseA[i]));
    const aImag = linearMagA * Math.sin(toRadians(phaseA[i]));
    const bReal = linearMagB * Math.cos(toRadians(phaseB[i]));
    const bImag = linearMagB * Math.sin(toRadians(phaseB[i]));
    const sumReal = aReal + bReal;
    const sumImag = aImag + bImag;
    const magnitude = 20 * Math.log10(Math.sqrt(sumReal ** 2 + sumImag ** 2));
    sumMagnitudes.push(magnitude);
  }
  return sumMagnitudes;}
function vectorDivide(impulseA, impulseB) {
  const complexA = impulseA.map(val => math.complex(val, 0));
  const complexB = impulseB.map(val => math.complex(val, 0));
  const Af = math.fft(complexA);
  const Bf = math.fft(complexB);
  const Yf = math.map(Af, (val, i) => math.divide(val, Bf[i]));
  return math.ifft(Yf).map(complex => complex.re);}
async function fastConvolution(arrayData, micCalFile) {
  return new Promise((resolve, reject) => {
    const offlineCtx = new OfflineAudioContext(1, arrayData.length, 48000);
    const bufferA = offlineCtx.createBuffer(1, arrayData.length, 48000);
    const bufferB = offlineCtx.createBuffer(1, micCalFile.length, 48000);
    bufferA.getChannelData(0).set(arrayData);
    bufferB.getChannelData(0).set(micCalFile);
    const source = offlineCtx.createBufferSource();
    const convolver = offlineCtx.createConvolver();
    convolver.normalize = true;
    source.buffer = bufferA;
    convolver.buffer = bufferB;
    source.connect(convolver);
    convolver.connect(offlineCtx.destination);
    offlineCtx.oncomplete = (e) => {
      const result = Array.from(e.renderedBuffer.getChannelData(0));
      resolve(result);
    };
    source.start(0);
    offlineCtx.startRendering().catch(reject);
  });}
// REW API
async function updateAPI(endpoint, bodyValue) {
  const url = `http://localhost:4735/application/${endpoint}`;
  await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(bodyValue)
  });}
async function clearCommands() {
  const body = {command: 'Clear command in progress'};
  await updateAPI('command', body);}
async function fetchREW(indice = null, method = 'GET', body = null){
  let _body;
  let requestUrl;
  if (indice === null) {requestUrl = baseUrl;} else {requestUrl = baseUrl + `/${indice}`};
  if (method === 'PUT') {_body = body}
  while (true) {
    try {
      const response = await fetch(requestUrl, {
        method: method,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(_body)
      });
      if (!response.ok) {
        await new Promise(resolve => setTimeout(resolve, speedDelay));
      } else {
        const data = await response.json();
        return data;
      }
    } catch (error) {
      throwError('Error fetching result:', error);
    }
  }}
async function fetchSafe(requestUrl, indice = null, parameters = null){
  const extUrl = indice ? `${baseUrl}/${indice}/${requestUrl}` : `${baseUrl}/${requestUrl}`;
  let options;
  if (parameters === null) {
    options = {
      method: 'GET'
    };
  } else {
    options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(parameters)
    };
  }
  while (true) {
    try {
      const response = await fetch(extUrl, options);
      if (!response.ok) {
        await new Promise(resolve => setTimeout(resolve, speedDelay));
      } else {
        const data = await response.json();
        return data;
      }
    } catch (error) {
      throwError('Error fetching result: ' + error);
    }
  }}
async function fetchAlign(requestUrl){
  try {
    const extUrl = `http://localhost:4735/alignment-tool/${requestUrl}`;
    const response = await fetch(extUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) {
      throwError(`HTTP error ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    throwError('Error fetching result:', error);
  }}
async function postNext(processName, indices, parameters = null) {
  const isProcessMeasurements = Array.isArray(indices);
  const isTrimCommand = processName === "Trim IR to windows";
  const isEqCommand = !isProcessMeasurements && !isTrimCommand && parameters === null;
  const requestUrl = isTrimCommand
    ? `${baseUrl}/${indices}/command`
    : isProcessMeasurements
    ? `${baseUrl}/process-measurements`
    : `${baseUrl}/${indices}/${isEqCommand ? 'eq/command' : 'command'}`;
  const body = {
      ...(isProcessMeasurements 
          ? { 
              processName,
              measurementIndices: indices 
            }
          : { 
              command: processName 
            }),
      ...(parameters && {parameters})
  };
  const fetchData = async () => {
      const response = await fetch(requestUrl, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(body)
      });
      if (!response.ok) {
          throw new Error('Network response was not OK!');
      }
      return response.json();
  };
  const checkResponse = async (data) => {
      if (data.message?.includes('ompleted')) {
          const resultResponse = await fetch(`${baseUrl}/process-result`);
          if (!resultResponse.ok) {
              throw new Error('Failed to fetch result data!');
          }
          return resultResponse.json();
      }
      if (data.message?.includes('in progress') || data.message?.includes('running')) {
          await new Promise(resolve => setTimeout(resolve, speedDelay));
          return checkResponse(await fetchData());
      }
      return data;
  };
  try {
      const data = await fetchData();
      return await checkResponse(data);
  } catch (error) {
      throw error;
  }}
async function postSafe(requestUrl, parameters, message){
  const fetchData = async () => {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(parameters),
    });
    if (!response.ok) {
      throwError('Network response was not OK!');
    }
    const data = await response.json();
    return data;};
  const checkResponse = async (data) => {
    if (data.message.includes(message)) {
      return data;
    } else if (data.message.includes('in progress') || data.message.includes('running')) {
      await new Promise((resolve) => setTimeout(resolve, speedDelay));
      return checkResponse(await fetchData());
    } else {
      throwError(`Unexpected response: ${data.message}`);
    }
  };
  try {
    const data = await fetchData();
    const result = await checkResponse(data);
    return result;
  } catch (error) {
    throwError;
  }}
async function postAlign(processName, frequency = null) {
  try {
    const response = await fetch('http://localhost:4735/alignment-tool/command', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ 
        command: processName,
        ...(frequency != null && {frequency})
      })
    });
    const responseText = await response.text();
    const data = JSON.parse(responseText);
    const parsedMessage = JSON.parse(data.message);
    if (parsedMessage.results?.[0]?.Error) {
      const errorMessage = parsedMessage.results[0].Error;
      const delayMatch = errorMessage.match(/delay required to align the responses.*(-?[\d.]+) ms/);
      if (delayMatch) {
        return { 
          message: 'Delay too large', 
          error: errorMessage, 
          delay: parseFloat(delayMatch[1]) 
        };
      }
    }
    return parsedMessage;
  } catch (error) {
    throwError(error);
  }}
async function postDelete(indice){
  const mDeleted = `Measurement ${indice} deleted`
  while (true) {
    try {
      const response = await fetch(`${baseUrl}/${indice}`, {
        method: 'DELETE',
        headers: {'Content-Type': 'application/json'},
      });
      if (!response.ok) {
        throwError('Network response was not OK!');
      }
      const data = await response.json();
      if (data.message === mDeleted) {
        return indice;
      } else {
        await new Promise(resolve => setTimeout(resolve, speedDelay));
      }
    } catch (error) {
      throwError('Error fetching result:', error);
    }
  }}
async function putSafe(requestUrl, parameters, message){
  const fetchData = async () => {
    const response = await fetch(requestUrl, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(parameters),
    });
    if (!response.ok) {
      throwError('Network response was not OK!');
    }
    const data = await response.json();
    return data;
  };
  const checkResponse = async (data) => {
    if (data.message.includes(message)) {
      return data;
    } else if (data.message.includes('in progress') || data.message.includes('running')) {
      await new Promise((resolve) => setTimeout(resolve, speedDelay));
      return checkResponse(await fetchData());
    } else {
      throwError(`Unexpected response: ${data.message}`);
    }
  };
  try {
    const data = await fetchData();
    const result = await checkResponse(data);
    return result;
  } catch (error) {
    throwError;
  }}
// ERROR
function throwError(errorInput){
    clearCommands();
    updateAPI('inhibit-graph-updates', false);
    updateAPI('blocking', false);
    throw new Error;}
// CONSTANTS
const micCalData = [0.0001732656,
                    0.00011976276,
                    0.00001230612,
                    -0.0000120264,
                    -0.00001900416,
                    -0.00000516708,
                    0.00000607398,
                    0.0000136242,
                    0.000006273096,
                    0.0000006640296,
                    -0.000003046272,
                    -0.000005766,
                    -0.00001322604,
                    -0.000002651232,
                    0.000002062296,
                    0.00000327678,
                    0.000003340176,
                    0.0000011433096,
                    -0.00000140124,
                    -0.000001413204,
                    0.000001298952,
                    0.0000011652108,
                    0.000002878476,
                    0.00000261012,
                    0.0000009124884,
                    -0.000001445436,
                    -0.000001291392,
                    -0.000001321464,
                    0.0000001581288,
                    -0.000003160188,
                    -0.000002104296,
                    0.0000005191452,
                    0.00000253548,
                    0.0000001831032,
                    0.0000003572412,
                    -0.0000004590396,
                    0.0000003511212,
                    -0.0000006584892,
                    0.00000169074,
                    0.0000007765152,
                    -0.00000157656,
                    0.0000009727896,
                    0.00000005494344,
                    -0.000001565784,
                    0.000000397224,
                    0.000002481408,
                    0.0000002426772,
                    -0.000001482696,
                    -0.0000005063844,
                    -0.00000128268,
                    -0.0000011690436,
                    0.000000551118,
                    -0.0000003659508,
                    0.00000142116,
                    0.000001352232,
                    -0.0000003391728,
                    -0.0000010768584,
                    -0.000001848348,
                    0.0000011806092,
                    0.000002621808,
                    -0.00000002860488,
                    0.0000004148616,
                    -0.0000009169824,
                    -0.0000011064096,
                    0.0000007606572,
                    -0.0000003468708,
                    -0.0000001806396,
                    0.000001047942,
                    -0.000000928704,
                    -0.00000126642,
                    -0.0000002511012,
                    -0.0000004088304,
                    0.0000003148704,
                    0.00000148074,
                    0.0000003470436,
                    0.0000003671004,
                    0.0000006641364,
                    -0.000001294224,
                    -0.0000007044912,
                    0.0000011693748,
                    0.0000003873684,
                    0.0000006134232,
                    0.0000003766152,
                    -0.000002273916,
                    -0.000002485524,
                    -0.0000006555324,
                    0.0000002648868,
                    0.00000195768,
                    0.000004056132,
                    0.000002523624,
                    -0.000000996762,
                    -0.000003636576,
                    -0.000004231272,
                    -0.000001500156,
                    0.000002158644,
                    0.000002245068,
                    -0.00000008145672,
                    -0.000001701732,
                    -0.000000001671468,
                    0.000002094132,
                    0.000002137392,
                    0.0000004664712,
                    -0.000001482204,
                    -0.000001701696,
                    0.00000003545472,
                    0.0000008128344,
                    0.0000007616412,
                    0.000001224876,
                    0.000001565172,
                    0.0000008147724,
                    0.0000003824988,
                    -0.0000004326696,
                    -0.000003069324,
                    -0.000002714724,
                    -0.0000006497556,
                    -0.0000000232962,
                    0.000000862146,
                    0.0000003909,
                    -0.0000011195784,
                    -0.0000003041196,
                    0.0000006700512,
                    0.0000004140552,
                    0.0000004097316,
                    0.0000001804092,
                    -0.0000004576428,
                    -0.0000003783672,
                    0.00000004354224,
                    0.0000002365104,
                    0.0000005847732,
                    0.0000007154316,
                    0.000000339996,
                    0.00000003219276,
                    0.0000001485492,
                    0.0000002790924,
                    0.0000002368812,
                    0.00000005128764,
                    -0.0000001437432,
                    -0.0000004185876,
                    -0.0000002825724,
                    0.0000002831292,
                    0.0000002191416,
                    -0.0000002474844,
                    -0.0000003796296,
                    -0.0000001392372,
                    0.0000002130372,
                    0.0000003143472,
                    -0.000000003339744,
                    -0.0000003666408,
                    -0.000000597396,
                    -0.0000005018424,
                    0.000000008330244,
                    0.0000005705664,
                    0.0000005476308,
                    0.00000006246024,
                    -0.0000002032572,
                    -0.0000003058356,
                    -0.0000002084544,
                    -0.00000004397748,
                    -0.000000009452088,
                    -0.00000002229396,
                    0.0000001935648,
                    0.00000009335712,
                    -0.00000010469256,
                    -0.00000006686112,
                    0.0000001224432,
                    0.00000010489212,
                    0.000000265164,
                    0.0000003597852,
                    0.0000001877172,
                    -0.00000009574368,
                    -0.0000003745596,
                    -0.0000005651148,
                    -0.0000002432484,
                    0.000000144474,
                    0.000000168126,
                    0.00000004622028,
                    -0.00000002031396,
                    0.000000008967324,
                    -0.0000000925452,
                    0.00000002626212,
                    0.0000002355384,
                    0.0000002769852,
                    0.00000009213252,
                    0.00000000881958,
                    -0.00000009564324,
                    -0.00000002851284,
                    0.0000001737984,
                    0.0000001658976,
                    -0.00000009184656,
                    -0.0000002868492,
                    -0.0000003134532,
                    -0.0000001237116,
                    0.0000001401516,
                    0.0000002366124,
                    0.00000009229008,
                    0.00000002688312,
                    -0.00000002076324,
                    0.00000007953684,
                    0.00000009943152,
                    -0.0000001452252,
                    -0.0000002816904,
                    -0.00000012207,
                    0.0000001670244,
                    0.0000002903832,
                    0.0000000473328,
                    -0.0000002575176,
                    -0.0000003620436,
                    -0.00000002991432,
                    0.0000003081612,
                    0.0000001430808,
                    -0.0000001676628,
                    -0.0000003148272,
                    -0.0000001564956,
                    0.0000000393582,
                    0.00000003631476,
                    0.00000002015544,
                    0.0000000722184,
                    0.0000002038416,
                    0.0000001856772,
                    -0.0000000968568,
                    -0.000000117588,
                    0.00000001364784,
                    0.0000001846188,
                    0.0000001733664,
                    -0.00000004249764,
                    -0.0000001123266,
                    -0.00000005563572,
                    0.000000004529112,
                    0.0000000435366,
                    -0.00000011576892,
                    0.00000001219776,
                    0.0000002005116,
                    0.0000002237772,
                    0.0000001859148,
                    -0.00000009059136,
                    -0.0000002930832,
                    -0.000000073815,
                    0.00000011822136,
                    0.000000201006,
                    0.00000008747184,
                    -0.00000026157,
                    -0.0000003311172,
                    -0.00000005554836,
                    0.0000001569732,
                    0.0000001263696,
                    -0.000000031485,
                    -0.00000022785,
                    -0.00000009357324,
                    0.0000001298328,
                    0.0000001332492,
                    -0.00000001573464,
                    -0.0000001711176,
                    -0.00000010548036,
                    0.0000001435188,
                    0.0000001464936,
                    0.00000002502852,
                    -0.000000108027,
                    -0.0000002684868,
                    -0.00000010157124,
                    0.0000001513632,
                    0.00000011692296,
                    -0.0000000139116,
                    -0.00000006196308,
                    -0.0000001515804,
                    -0.00000004723128,
                    0.0000002507472,
                    0.0000002034468,
                    0.00000006034068,
                    0.00000001915872,
                    -0.0000001248912,
                    -0.00000002270568,
                    0.00000010832208,
                    0.00000003338784,
                    0.0000000489348,
                    0.00000005592924,
                    0.00000001488912,
                    0.00000003920136,
                    0.00000003966708,
                    -0.00000007733436,
                    -0.00000007515024,
                    0.00000007747896,
                    0.00000006886848,
                    0.00000003578952,
                    0.00000002453376,
                    -0.0000001588368,
                    -0.0000001901604,
                    -0.00000003665496,
                    -0.00000001671192,
                    0.00000004290084,
                    0.00000003134544,
                    -0.00000006335808,
                    -0.00000007657272,
                    -0.00000004045884,
                    0.000000004762284,
                    0.00000004057212,
                    -0.0000000147276,
                    0.0000000245856,
                    0.00000000110127,
                    -0.00000005746788,
                    0.00000001986936,
                    0.00000002153904,
                    -0.00000006864396,
                    0.00000001735512,
                    0.000000011999076,
                    -0.0000000984882,
                    0.00000003642348,
                    0.00000009356304,
                    -0.00000002821608,
                    0.0000000010501908,
                    0.00000001527744,
                    -0.00000004965828,
                    0.0000001217988,
                    0.0000001954728,
                    0.00000006236388,
                    -0.00000003409752,
                    -0.00000007536588,
                    -0.0000001090002,
                    0.00000005015256,
                    0.0000001869432,
                    0.0000001487436,
                    0.00000004333848,
                    -0.00000005998776,
                    -0.0000001791384,
                    -0.0000001345056,
                    0.000000043464,
                    0.00000007383432,
                    -0.00000002635044,
                    -0.0000000941466,
                    -0.0000001221528,
                    -0.000000092388,
                    0.0000000221448,
                    0.000000131298,
                    0.00000010701684,
                    0.00000004529784,
                    -0.00000003024108,
                    -0.00000010135632,
                    -0.00000006012792,
                    0.00000005012136,
                    0.00000008243916,
                    0.00000002275428,
                    -0.00000004870932,
                    -0.000000121494,
                    -0.0000001354656,
                    -0.00000007651428,
                    0.00000001865676,
                    0.00000009881784,
                    0.0000001406592,
                    0.00000006383676,
                    -0.0000000715038,
                    -0.00000011089392,
                    -0.00000005599344,
                    -0.00000000422394,
                    0.00000007345044,
                    0.00000007416636,
                    0.00000002817276,
                    -0.00000001024002,
                    -0.00000002179188,
                    -0.0000000038541,
                    0.00000005413164,
                    0.0000001139346,
                    0.0000001497876,
                    0.00000010909884,
                    -0.000000002291892,
                    -0.00000011497992,
                    -0.00000007964904,
                    -0.000000010306272,
                    0.00000001251432,
                    0.00000001385028,
                    -0.0000000428628,
                    -0.00000009962016,
                    -0.00000010931784,
                    -0.00000004606728,
                    0.00000005791404,
                    0.00000010061712,
                    0.00000008121456,
                    0.000000006597636,
                    -0.00000006045108,
                    0.00000000561402,
                    0.00000002924484,
                    -0.00000002569752,
                    -0.0000000845466,
                    -0.00000007138044,
                    -0.00000004550544,
                    -0.00000006831504,
                    -0.00000008157816,
                    -0.00000006851484,
                    -0.00000002661816,
                    0.00000006180756,
                    0.00000009264252,
                    0.0000001114482,
                    0.0000001362528,
                    0.00000007043724,
                    0.0000000179508,
                    0.000000004667712,
                    0.000000042354,
                    0.00000005578764,
                    -0.000000003306996,
                    -0.0000000529758,
                    -0.00000009567528,
                    -0.00000008907168,
                    -0.000000010668744,
                    0.00000001217052,
                    -0.000000006787428,
                    -0.0000000212622,
                    -0.0000000142218,
                    0.00000005218152,
                    0.00000006857064,
                    0.00000001989036,
                    -0.000000006761052,
                    -0.000000011358768,
                    0.00000001718796,
                    0.00000003518388,
                    -0.000000005487384,
                    -0.00000004452156,
                    -0.000000027762,
                    -0.00000001235184,
                    -0.00000001655256,
                    -0.00000003177552,
                    -0.00000003967248,
                    0.000000011370216,
                    0.00000004188588,
                    0.000000015216,
                    0.00000001633632,
                    -0.00000003857352,
                    -0.00000002084268,
                    0.0000000688128,
                    0.00000006248448,
                    -0.00000001860588,
                    -0.00000008683512,
                    -0.00000009274056,
                    -0.00000000765426,
                    0.0000000528342,
                    0.00000001045386,
                    -0.00000005056068,
                    -0.00000002958144,
                    0.000000009629052,
                    0.00000001900812,
                    0.000000004720464,
                    -0.00000003943308,
                    0.00000001992252,
                    0.0000001023354,
                    0.00000010969572,
                    0.0000000688608,
                    -0.00000002050212,
                    -0.0000000766482,
                    0.000000004606248,
                    0.00000006872376,
                    0.00000009751176,
                    0.00000004413888,
                    -0.0000000636882,
                    -0.00000008020488,
                    -0.00000002481252,
                    -0.00000002075004,
                    -0.00000004148316,
                    -0.00000007265208,
                    -0.0000000799278,
                    -0.00000001820424,
                    0.0000000485292,
                    0.00000001735452,
                    -0.0000000355002,
                    -0.0000000314934,
                    -0.00000003820932,
                    0.00000001727484,
                    0.00000010097412,
                    0.00000007007928,
                    0.0000000321036,
                    0.00000002353596,
                    -0.00000004456932,
                    -0.00000006092952,
                    -0.00000002921328,
                    -0.00000006018516,
                    -0.0000000546192,
                    -0.000000002243388,
                    0.0000000216294,
                    0.000000074271,
                    0.00000009520152,
                    0.0000000515394,
                    0.00000002103912,
                    0.00000001418916,
                    0.000000001735176,
                    0.00000002736444,
                    0.00000001815396,
                    -0.000000005018628,
                    -0.000000009754032,
                    -0.0000000333324,
                    -0.00000004122504,
                    -0.000000022245,
                    -0.0000000293418,
                    -0.00000003260484,
                    -0.0000000468402,
                    -0.0000000348852,
                    0.0000000241758,
                    0.00000005226684,
                    0.00000003166152,
                    0.000000021132,
                    -0.00000002260692,
                    -0.000000051768,
                    -0.00000000826938,
                    0.0000000011978532,
                    -0.000000010503504,
                    0.00000003054996,
                    0.00000003149688,
                    -0.000000002399004,
                    0.00000003773904,
                    0.00000005319468,
                    0.000000004048608,
                    -0.00000001574412,
                    -0.00000002538024,
                    -0.00000004251744,
                    0.000000001200204,
                    0.000000005351892,
                    -0.0000000498252,
                    -0.00000005684496,
                    -0.00000000005053584,
                    0.00000001633788,
                    -0.000000001499628,
                    -0.00000002388228,
                    -0.00000005426952,
                    -0.00000001679592,
                    0.000000078879,
                    0.00000009955044,
                    0.00000006305088,
                    0.0000000376758,
                    0.000000005715888,
                    -0.00000001604832,
                    -0.00000001289112,
                    0.000000005987952,
                    -0.000000004171524,
                    -0.000000006651612,
                    -0.00000001538172,
                    -0.00000003841644,
                    -0.000000010990128,
                    0.00000004136688,
                    0.00000005244,
                    0.00000001725324,
                    -0.00000004013736,
                    -0.00000007525536,
                    -0.00000005291412,
                    0.00000001912608,
                    0.00000005423856,
                    0.00000001378944,
                    -0.00000002005776,
                    -0.00000004665684,
                    -0.00000004911264,
                    -0.000000006291672,
                    -0.000000004012452,
                    -0.0000000238968,
                    -0.00000002237436,
                    0.000000003226452,
                    0.00000002546064,
                    0.00000002311872,
                    0.00000001641012,
                    0.00000001393572,
                    0.00000002068056,
                    0.00000003580284,
                    0.00000001318992,
                    -0.000000008744112,
                    -0.000000010922496,
                    0.000000010961124,
                    0.00000004547064,
                    0.00000004340412,
                    0.00000001982796,
                    0.000000010440252,
                    -0.000000002960136,
                    -0.00000001928172,
                    -0.00000005314032,
                    -0.00000007102788,
                    -0.00000004022172,
                    -0.00000000665928,
                    0.00000002783844,
                    0.000000008779728,
                    -0.0000000346164,
                    -0.0000000419262,
                    -0.000000005071224,
                    0.00000004199688,
                    0.00000006575004,
                    0.00000003642672,
                    0.00000000618384,
                    0.000000004571988,
                    0.00000002180244,
                    0.0000000174276,
                    0.000000005666448,
                    -0.00000001679244,
                    -0.00000002099376,
                    -0.000000010078872,
                    -0.000000009832896,
                    -0.00000003447588,
                    -0.00000007383696,
                    -0.00000004997772,
                    0.00000002119872,
                    0.00000006755844,
                    0.00000008596284,
                    0.00000004220028,
                    -0.000000028851,
                    -0.000000027057,
                    -0.0000000011479848,
                    0.00000000470418,
                    -0.0000000266172,
                    -0.00000007200816,
                    -0.00000007540236,
                    -0.00000003863448,
                    0.000000006564948,
                    0.00000003607176,
                    0.00000002558352,
                    0.000000004461996,
                    0.000000007476276,
                    0.00000003758172,
                    0.00000005823468,
                    0.00000005276556,
                    0.000000020091,
                    -0.000000002735868,
                    0.00000002231664,
                    0.0000000492192,
                    0.000000024588,
                    -0.000000006723888,
                    -0.00000005281908,
                    -0.0000000599166,
                    -0.00000002190024,
                    -0.00000001211904,
                    -0.0000000191658,
                    -0.00000002989068,
                    -0.00000005134992,
                    -0.000000029925,
                    0.000000009042756,
                    0.0000000271386,
                    0.00000004722384,
                    0.00000005251488,
                    0.00000004374528,
                    0.00000004290348,
                    0.00000002319024,
                    -0.00000001874508,
                    -0.00000004537728,
                    -0.00000004745352,
                    -0.00000003674748,
                    -0.00000001912596,
                    -0.0000000068478,
                    -0.00000002301168,
                    -0.00000003456084,
                    -0.000000031395,
                    -0.0000000011740896,
                    0.00000003298764,
                    0.000000035031,
                    0.00000002604696,
                    0.00000003450288,
                    0.00000001940712,
                    -0.0000000009593064,
                    0.000000004563984,
                    0.00000001237152,
                    0.00000002336508,
                    0.00000003258732,
                    -0.000000001383228,
                    -0.00000002355384,
                    -0.0000000147042,
                    -0.00000003636372,
                    -0.0000000438624,
                    -0.00000003122676,
                    -0.00000003386868,
                    -0.00000001512996,
                    0.00000001274112,
                    0.000000009364848,
                    0.00000003761844,
                    0.0000000604158,
                    0.0000000341448,
                    0.00000002291208,
                    0.00000002300208,
                    0.000000001670964,
                    -0.000000006428292,
                    -0.000000011173068,
                    -0.00000001610772,
                    0.000000004072992,
                    0.00000001880544,
                    0.00000000652212,
                    -0.00000001463124,
                    -0.00000003016344,
                    -0.00000003443544,
                    -0.0000000183846,
                    -0.000000002647044,
                    0.000000002951136,
                    -0.0000000004674948,
                    -0.00000001603824,
                    -0.000000010943052,
                    -0.00000000891528,
                    -0.000000012999,
                    0.00000000136248,
                    0.000000003457776,
                    -0.000000006745584,
                    0.0000000003017784,
                    0.0000000010202688,
                    0.000000001324044,
                    0.00000000640482,
                    -0.000000000763434,
                    -0.000000007751628,
                    0.000000008185632,
                    0.00000001960608,
                    0.00000000842892,
                    0.00000001522176,
                    0.00000002415384,
                    0.00000002698848,
                    0.0000000383196,
                    0.0000000216438,
                    -0.000000007679676,
                    -0.000000004411116,
                    -0.000000010740624,
                    -0.0000000224442,
                    -0.00000001815912,
                    -0.00000000332826,
                    -0.00000001325496,
                    -0.00000001275036,
                    -0.000000007447092,
                    -0.00000002320548,
                    -0.0000000166182,
                    0.0000000177288,
                    0.00000001989672,
                    0.00000001668048,
                    0.000000008110164,
                    -0.00000001983108,
                    -0.00000002346852,
                    0.000000006106392,
                    0.00000002788824,
                    0.0000000149886,
                    0.000000002296992,
                    -0.0000000004203948,
                    -0.000000010346268,
                    -0.000000007294764,
                    -0.0000000061506,
                    -0.00000002353212,
                    -0.00000001465692,
                    -0.000000002536596,
                    -0.000000002696076,
                    -0.000000008143848,
                    -0.00000000530388,
                    -0.000000004343484,
                    -0.000000006420564,
                    0.000000003679848,
                    0.000000007299876,
                    0.00000000786606,
                    0.00000002681628,
                    0.00000002521212,
                    0.000000009475488,
                    0.000000006818796,
                    0.000000007460436,
                    0.000000002897184,
                    0.000000001813776,
                    -0.000000004632888,
                    -0.000000011602452,
                    -0.000000005044308,
                    0.000000005376228,
                    -0.0000000007036668,
                    -0.000000009526428,
                    -0.0000000144084,
                    -0.000000003883344,
                    0.00000000761238,
                    0.00000001201116,
                    0.000000003152928,
                    -0.00000001376856,
                    -0.00000000520044,
                    0.00000001317276,
                    0.00000001687212,
                    0.000000008126136,
                    -0.00000001775928,
                    -0.00000002939796,
                    -0.00000000011679876,
                    0.000000025989,
                    0.00000003181788,
                    0.000000009643548,
                    -0.00000001552116,
                    -0.00000001683828,
                    -0.00000001377384,
                    -0.00000001361976,
                    -0.0000000150306,
                    -0.00000002102484,
                    -0.0000000139182,
                    -0.00000001340652,
                    -0.0000000201774,
                    -0.00000002100768,
                    -0.000000001951548,
                    0.0000000330618,
                    0.00000005901408,
                    0.00000004970892,
                    0.0000000140226,
                    -0.0000000176826,
                    -0.00000002676528,
                    -0.000000008679096,
                    0.00000002360796,
                    0.00000003246264,
                    0.000000009613116,
                    -0.00000000258198,
                    -0.000000008716884,
                    -0.00000000832398,
                    -0.000000003348336,
                    -0.00000001487796,
                    -0.00000001998984,
                    -0.000000003744456,
                    0.000000002541924,
                    0.000000002340564,
                    -0.000000010313508,
                    -0.00000001759884,
                    0.000000000198438,
                    0.00000001755684,
                    0.00000001938888,
                    0.000000007690584,
                    -0.000000009899844,
                    -0.000000009696336,
                    0.000000005835636,
                    0.000000008665476,
                    0.000000008425488,
                    0.000000003234192,
                    -0.0000000168102,
                    -0.00000002234796,
                    -0.000000007103712,
                    0.00000000203334,
                    0.00000000573516,
                    0.000000005694492,
                    -0.00000000612786,
                    -0.000000008973924,
                    -0.0000000001252536,
                    0.000000002798208,
                    -0.0000000005802528,
                    0.000000002621532,
                    0.000000010357128,
                    0.00000002275308,
                    0.00000002026356,
                    -0.00000000571632,
                    -0.00000002254056,
                    -0.00000002050512,
                    -0.000000009246252,
                    0.000000008292636,
                    0.00000001773792,
                    0.00000000628452,
                    0.000000002972424,
                    -0.00000000208614,
                    -0.000000010796052,
                    -0.000000003174588,
                    0.00000000496776,
                    0.00000000659976,
                    0.00000001267512,
                    -0.000000003925308,
                    -0.00000001338396,
                    -0.000000003269124,
                    0.000000004831824,
                    0.00000001252476,
                    0.00000001597224,
                    -0.0000000007179528,
                    -0.000000003809592,
                    0.000000006654024,
                    0.0000000003295488,
                    -0.00000001307304,
                    -0.00000002648736,
                    -0.00000004131348,
                    -0.00000002154216,
                    0.00000001337904,
                    0.00000001131264,
                    0.000000008854908,
                    0.000000007443216,
                    0.000000006191964,
                    0.00000002297628,
                    0.00000002761116,
                    0.0000000011484672,
                    -0.00000002399256,
                    -0.00000003378552,
                    -0.00000002062956,
                    0.000000003695244,
                    0.0000000191502,
                    0.00000001491516,
                    0.000000013131,
                    0.00000001543056,
                    0.00000001345548,
                    0.000000008904804,
                    -0.000000001834236,
                    -0.0000000131856,
                    -0.00000001428,
                    -0.0000000137886,
                    -0.000000006535296,
                    0.000000001830036,
                    0.00000000735372,
                    0.0000000134958,
                    0.000000006678012,
                    0.000000003146112,
                    0.000000011993208,
                    0.000000004114596,
                    -0.00000000837072,
                    -0.00000001518288,
                    -0.00000001809156,
                    -0.0000000168216,
                    -0.000000008726028,
                    -0.000000001934796,
                    -0.000000007568844,
                    -0.0000000034137,
                    0.000000007294932,
                    0.00000001361496,
                    0.00000002457816,
                    0.00000001554564,
                    -0.00000001285644,
                    -0.00000001937592,
                    -0.0000000139392,
                    -0.000000004914468,
                    0.000000001636728,
                    0.0000000006248196,
                    -0.000000005648724,
                    0.000000003525132,
                    0.00000002059212,
                    0.000000021255,
                    0.000000012291,
                    0.0000000008662512,
                    -0.00000001278528,
                    -0.000000007366236,
                    0.000000003924624,
                    -0.000000002337672,
                    -0.000000010226412,
                    -0.000000004202472,
                    0.00000000261786,
                    0.000000010507344,
                    0.00000001988244,
                    0.00000001607316,
                    0.000000008919696,
                    0.000000005364,
                    -0.000000009213372,
                    -0.00000002665152,
                    -0.00000002517816,
                    -0.00000001870308,
                    -0.00000001489248,
                    -0.000000006101076,
                    0.000000010776792,
                    0.00000001205436,
                    0.00000001495968,
                    0.0000000288618,
                    0.00000002366076,
                    0.000000007232196,
                    -0.000000010816068,
                    -0.000000033486,
                    -0.00000002981508,
                    -0.00000000581478,
                    0.000000003072732,
                    -0.000000006429804,
                    -0.00000001390944,
                    -0.000000002099544,
                    0.00000001546416,
                    0.00000002761212,
                    0.00000002458512,
                    -0.0000000008183184,
                    -0.00000002074728,
                    -0.00000001735092,
                    -0.000000006808512,
                    0.000000007033068,
                    0.000000009756696,
                    -0.000000006121032,
                    -0.0000000157242,
                    -0.00000000866856,
                    0.000000005824896,
                    0.00000001482516,
                    0.0000000175374,
                    0.00000001297644,
                    0.000000009983064,
                    0.00000001628472,
                    0.00000001447284,
                    0.000000002389788,
                    -0.000000008819412,
                    -0.000000011226876,
                    -0.000000003632016,
                    0.000000002037924,
                    -0.00000000542196,
                    -0.00000001522584,
                    -0.00000001971036,
                    -0.000000003573864,
                    0.00000001250592,
                    0.00000001084836,
                    -0.0000000010215624,
                    -0.00000001597128,
                    -0.00000002633964,
                    -0.0000000144774,
                    0.000000004653204,
                    0.0000000188664,
                    0.00000002204856,
                    0.000000006188316,
                    -0.000000009231168,
                    -0.000000006288696,
                    0.0000000002541924,
                    0.000000004643844,
                    0.000000002579328,
                    -0.00000000872232,
                    -0.00000001263108,
                    -0.000000009106464,
                    -0.000000002096904,
                    0.000000008412624,
                    0.0000000155652,
                    0.000000008668812,
                    0.000000001969332,
                    -0.000000004715328,
                    -0.0000000041238,
                    0.000000002379384,
                    0.000000003969468,
                    -0.000000001695252,
                    -0.000000003591744,
                    -0.000000001316832,
                    0.000000006646656,
                    0.00000001035072,
                    0.00000000628236,
                    0.000000000461802,
                    -0.000000001598124,
                    0.0000000003482448,
                    0.000000005428188,
                    0.000000007998096,
                    -0.00000000132882,
                    -0.000000008863788,
                    -0.00000000120108,
                    0.000000002596248,
                    0.00000000480516,
                    0.000000003233784,
                    -0.000000013011,
                    -0.00000001871892,
                    -0.000000010521756,
                    -0.0000000043371,
                    0.000000002729436,
                    0.000000005637696,
                    0.0000000010941192,
                    0.0000000008170992,
                    0.000000003681444,
                    0.000000000019809,
                    -0.0000000002566824,
                    0.000000003112272,
                    0.000000002114388,
                    0.000000007998492,
                    0.000000007916484,
                    -0.000000002519808,
                    -0.00000001226652,
                    -0.00000002446344,
                    -0.0000000259026,
                    -0.0000000052767,
                    0.000000006385836,
                    0.000000011974032,
                    0.000000011514744,
                    0.000000001576128,
                    0.000000004843332,
                    0.00000001799208,
                    0.00000001744212,
                    0.000000010324308,
                    0.000000005450436,
                    -0.0000000010079796,
                    -0.00000000541608,
                    -0.000000009411996,
                    -0.00000001957368,
                    -0.00000001700964,
                    -0.000000001834716,
                    0.00000000444804,
                    0.0000000123828,
                    0.000000010721904,
                    0.000000000593586,
                    0.000000006794664,
                    0.00000001406052,
                    0.000000010804788,
                    0.000000004586964,
                    -0.000000006723912,
                    -0.00000001219956,
                    -0.000000007688964,
                    0.000000002245308,
                    0.00000000264,
                    -0.000000001391868,
                    -0.000000001929732,
                    -0.000000001790412,
                    -0.00000000418218,
                    -0.00000001416252,
                    -0.00000002735088,
                    -0.00000002709576,
                    -0.00000001202964,
                    0.000000005238888,
                    0.00000001241724,
                    0.000000006978516,
                    0.000000002339784,
                    0.0000000011782596,
                    0.000000007396944,
                    0.00000001917156,
                    0.00000002469192,
                    0.00000002162808,
                    0.00000001412916,
                    0.0000000011891304,
                    -0.00000001009362,
                    -0.000000010149588,
                    -0.000000006931596,
                    -0.000000007509432,
                    -0.000000005983152,
                    -0.000000006931212,
                    -0.000000007767924,
                    -0.000000003479832,
                    -0.000000004779624,
                    -0.0000000091431,
                    -0.000000008048832,
                    -0.00000000416022,
                    0.0000000000946578,
                    0.000000007974108,
                    0.00000001529028,
                    0.000000011478132,
                    0.00000001312776,
                    0.0000000195204,
                    0.000000019035,
                    0.00000001770852,
                    0.000000010525092,
                    -0.0000000123858,
                    -0.00000002534652,
                    -0.00000002461068,
                    -0.00000001729152,
                    -0.00000000800358,
                    -0.000000003193596,
                    -0.000000002653968,
                    -0.000000004394292,
                    -0.00000000560856,
                    -0.000000006593868,
                    -0.000000006079104,
                    0.0000000049392,
                    0.00000001417692,
                    0.000000010199976,
                    0.000000006593352,
                    0.000000000316866,
                    -0.000000000933264,
                    0.000000006684972,
                    0.000000007199532,
                    -0.000000003103512,
                    -0.000000008024868,
                    -0.000000007720752,
                    -0.000000005183064,
                    -0.0000000009546912,
                    0.000000003353988,
                    -0.0000000005828256,
                    0.000000001413984,
                    0.000000008407188,
                    0.000000008702724,
                    0.0000000030141,
                    -0.000000002352036,
                    -0.00000000801396,
                    -0.000000007186272,
                    0.000000002205108,
                    0.00000000825732,
                    0.00000000510036,
                    0.0000000006362976,
                    -0.000000003310836,
                    -0.000000008581896,
                    -0.0000000011390616,
                    0.00000001280652,
                    0.0000000138384,
                    0.00000001007064,
                    0.00000000564432,
                    -0.000000005794416,
                    -0.00000001208436,
                    -0.00000000996168,
                    -0.00000000655998,
                    -0.00000000181044,
                    -0.0000000005508948,
                    -0.000000007694892,
                    -0.00000001488228,
                    -0.0000000137964,
                    -0.000000003729168,
                    0.000000005050164,
                    0.000000007391868,
                    0.000000004485348,
                    -0.000000001868964,
                    -0.000000003688044,
                    0.000000009648732,
                    0.00000002340192,
                    0.0000000259206,
                    0.00000001821132,
                    0.000000001649004,
                    -0.00000001082532,
                    -0.00000001029114,
                    -0.00000001287984,
                    -0.00000001439424,
                    -0.00000001288944,
                    -0.00000001265076,
                    -0.000000010742952,
                    -0.000000007946208,
                    -0.000000003085692,
                    0.000000005885196,
                    0.00000001695864,
                    0.0000000200976,
                    0.000000011914932,
                    0.0000000003450252,
                    -0.000000005146788,
                    -0.00000000005203656,
                    0.000000009718572,
                    0.00000000726504,
                    -0.000000003641736,
                    -0.0000000134064,
                    -0.000000011952912,
                    0.000000000314268,
                    0.000000005860596,
                    0.00000000076566,
                    -0.000000001982868,
                    -0.0000000007716132,
                    0.00000000554802,
                    0.00000001063038,
                    0.0000000073179,
                    -0.0000000003520692,
                    -0.000000002291856,
                    0.0000000011296248,
                    0.00000000381018,
                    0.000000000210912,
                    -0.00000001488132,
                    -0.00000002542644,
                    -0.00000001544016,
                    -0.0000000005495376,
                    0.000000008781312,
                    0.000000007299456,
                    -0.000000007224672,
                    -0.000000007376568,
                    0.000000002868348,
                    0.000000008210196,
                    0.000000011834388,
                    0.000000010958664,
                    0.000000007448208,
                    0.000000009724128,
                    0.000000011177304,
                    0.000000002689308,
                    -0.000000008816556,
                    -0.00000001885764,
                    -0.00000002439216,
                    -0.00000001284432,
                    0.000000003613104,
                    0.000000009214248,
                    0.00000000953004,
                    0.000000004632252,
                    0.000000003397992,
                    0.000000010770252,
                    0.000000009727824,
                    0.000000004257492,
                    -0.000000002303208,
                    -0.0000000082248,
                    -0.0000000008114976,
                    0.00000001077834,
                    0.000000007398936,
                    -0.000000004903488,
                    -0.00000002085648,
                    -0.00000003123852,
                    -0.00000002344668,
                    -0.000000002765628,
                    0.000000010681236,
                    0.00000001534188,
                    0.000000011712372,
                    0.00000000324432,
                    0.00000000603096,
                    0.00000001409604,
                    0.000000015753,
                    0.000000011430576,
                    0.00000000377196,
                    -0.00000000535644,
                    -0.000000008068728,
                    -0.000000009523116,
                    -0.000000011951004,
                    -0.000000011165328,
                    -0.000000006395376,
                    -0.000000005486628,
                    -0.000000004171872,
                    -0.000000002355072,
                    0.0000000019983,
                    0.000000007258476,
                    0.000000006537396,
                    0.0000000005040036,
                    -0.00000000170094,
                    0.00000000008660472,
                    0.000000005996904,
                    0.000000009545772,
                    0.000000008637204,
                    0.00000000391314,
                    -0.000000003236184,
                    -0.00000000437376,
                    -0.000000001374084,
                    -0.0000000008222592,
                    -0.000000002223576,
                    -0.000000006815568,
                    -0.000000011484288,
                    -0.00000000899454,
                    -0.0000000014208,
                    0.000000007297884,
                    0.000000010174392,
                    0.00000001333392,
                    0.00000001479228,
                    0.000000007933524,
                    0.0000000008104032,
                    -0.000000006604584,
                    -0.000000011397876,
                    -0.000000005537604,
                    -0.0000000005065212,
                    -0.000000001846764,
                    -0.00000000599664,
                    -0.00000001212984,
                    -0.0000000147864,
                    -0.000000009478524,
                    -0.000000003696336,
                    -0.0000000011286876,
                    0.000000001929636,
                    0.00000000815418,
                    0.00000001201212,
                    0.00000001471812,
                    0.0000000145482,
                    0.00000000880278,
                    0.000000005245416,
                    0.000000008155884,
                    0.000000008588604,
                    0.000000004506396,
                    -0.000000002941476,
                    -0.0000000122322,
                    -0.00000001637472,
                    -0.0000000125148,
                    -0.000000010373496,
                    -0.0000000131226,
                    -0.000000011689632,
                    -0.000000007577712,
                    -0.0000000003698712,
                    0.00000001146876,
                    0.0000000175788,
                    0.000000012867,
                    0.000000008679336,
                    0.000000004235016,
                    0.000000001454964,
                    0.000000002677068,
                    0.000000003135336,
                    -0.0000000007406268,
                    -0.000000003159756,
                    -0.000000001373748,
                    0.00000000011341464,
                    -0.00000000250728,
                    -0.000000008449644,
                    -0.00000001401768,
                    -0.00000001307904,
                    -0.000000005021328,
                    0.000000003269784,
                    0.00000000651822,
                    0.000000008959788,
                    0.000000008648124,
                    0.000000002799324,
                    0.0000000010984632,
                    -0.0000000002645424,
                    -0.000000002645868,
                    0.0000000007184028,
                    0.0000000002967696,
                    -0.000000006038532,
                    -0.000000006225468,
                    -0.000000002977188,
                    0.000000002254056,
                    0.000000007665168,
                    0.000000010201596,
                    0.000000006873792,
                    0.0000000010271484,
                    -0.0000000005073168,
                    0.0000000006869304,
                    0.000000001800768,
                    0.000000004077012,
                    0.000000002310696,
                    -0.000000004967424,
                    -0.00000001155486,
                    -0.00000001595412,
                    -0.00000001813896,
                    -0.00000001338492,
                    -0.0000000004646208,
                    0.00000001033566,
                    0.0000000156528,
                    0.000000017034,
                    0.000000007799028,
                    0.0000000003328284,
                    0.000000001975308,
                    0.000000005816256,
                    0.000000008986284,
                    0.000000007982292,
                    0.00000000008449104,
                    -0.000000009240492,
                    -0.00000001211712,
                    -0.000000007971252,
                    -0.000000003767052,
                    -0.000000002407416,
                    -0.000000006635796,
                    -0.000000010758612,
                    -0.000000007003848,
                    -0.000000002080872,
                    0.000000001876416,
                    0.00000000004097028,
                    -0.000000002941116,
                    0.000000001666728,
                    0.000000008852952,
                    0.000000010588356,
                    0.000000008645712,
                    0.000000002095296,
                    0.0000000011781744,
                    0.0000000054252,
                    0.000000007340028,
                    0.00000000586662,
                    0.000000004420284,
                    0.000000000929604,
                    -0.000000001996224,
                    -0.000000002435076,
                    -0.000000006733716,
                    -0.000000011377944,
                    -0.000000009755892,
                    -0.00000000822102,
                    -0.000000003941424,
                    0.0000000005727036,
                    -0.000000003433488,
                    -0.000000004467252,
                    0.000000000570648,
                    0.00000000585276,
                    0.000000011850924,
                    0.00000001230696,
                    0.000000004405608,
                    -0.0000000009464244,
                    -0.0000000040635,
                    -0.000000004194024,
                    0.000000002444592,
                    0.000000009010104,
                    0.000000009287712,
                    0.000000006776796,
                    -0.000000003140712,
                    -0.00000001433952,
                    -0.0000000145428,
                    -0.000000006676608,
                    0.000000002995776,
                    0.000000006179472,
                    -0.000000003154068,
                    -0.00000001272264,
                    -0.000000011984352,
                    -0.0000000036255,
                    0.000000005980224,
                    0.000000009565728,
                    0.000000005452668,
                    0.000000001888476,
                    0.00000000073089,
                    -0.00000000004501512,
                    0.000000001697268,
                    0.000000005218296,
                    0.000000004742568,
                    0.0000000059235,
                    0.000000007105188,
                    0.0000000020037,
                    -0.000000001946604,
                    -0.0000000051843,
                    -0.000000006802812,
                    -0.000000001493808,
                    0.000000002133276,
                    0.0000000000711894,
                    -0.000000001945176,
                    -0.000000002949792,
                    -0.0000000009067128,
                    0.000000001853052,
                    0.000000003806424,
                    0.00000000039255,
                    -0.000000005990004,
                    -0.000000008262672,
                    -0.000000005087388,
                    0.000000001260864,
                    0.000000007489512,
                    0.000000006045336,
                    0.000000001275888,
                    -0.000000002033976,
                    -0.000000002163936,
                    0.000000001517016,
                    0.000000003922464,
                    0.000000003641976,
                    0.000000001765596,
                    -0.0000000006275004,
                    -0.000000001328436,
                    -0.000000001330572,
                    -0.000000002465964,
                    -0.000000002655948,
                    -0.000000002579244,
                    -0.000000001399704,
                    -0.0000000006885768,
                    -0.000000003208512,
                    -0.000000006061452,
                    -0.000000005604396,
                    -0.00000000437064,
                    -0.000000002902356,
                    0.0000000003349872,
                    0.000000005137368,
                    0.000000008685552,
                    0.000000011196276,
                    0.000000009636936,
                    0.00000000599184,
                    0.000000003610452,
                    0.0000000005041944,
                    -0.000000001633104,
                    0.0000000005444016,
                    0.000000003124332,
                    0.000000001284336,
                    -0.000000003916812,
                    -0.000000009628932,
                    -0.00000001336788,
                    -0.000000011437596,
                    -0.000000005258196,
                    -0.0000000009590532,
                    0.000000002605884,
                    0.000000006546,
                    0.000000007237668,
                    0.000000006187176,
                    0.000000005913804,
                    0.000000004967616,
                    0.000000002562792,
                    0.000000002197656,
                    0.00000000005579964,
                    -0.000000003981948,
                    -0.000000004544952,
                    -0.000000005215632,
                    -0.000000004272648,
                    -0.0000000005459688,
                    -0.000000001330524,
                    -0.000000004478436,
                    -0.000000003868608,
                    -0.000000003025728,
                    0.00000000010302384,
                    0.000000002663196,
                    0.000000003319884,
                    0.000000002607864,
                    0.000000003906516,
                    0.000000007283076,
                    0.000000006617004,
                    0.00000000082113,
                    -0.000000002816424,
                    -0.000000005313684,
                    -0.000000003922884,
                    -0.000000001800132,
                    -0.000000003953244,
                    -0.000000006428568,
                    -0.0000000035616,
                    0.000000001498956,
                    0.000000003050136,
                    0.000000002589756,
                    -0.00000000003257208,
                    -0.0000000011162892,
                    0.000000004537296,
                    0.000000009807936,
                    0.000000009719556,
                    0.00000000814002,
                    0.00000000369504,
                    -0.0000000001527936,
                    -0.000000002141652,
                    -0.000000004209588,
                    -0.000000007988652,
                    -0.000000010749288,
                    -0.00000000792756,
                    -0.000000001773168,
                    0.000000001387692,
                    0.0000000004180968,
                    -0.000000004439496,
                    -0.000000005616876,
                    -0.000000000886068,
                    0.000000004074312,
                    0.000000004240284,
                    0.00000000191106,
                    0.000000001702224,
                    0.000000002799612,
                    0.000000005628084,
                    0.00000000743148,
                    0.000000003682284,
                    0.000000001703244,
                    0.000000002927328,
                    0.00000000008641884,
                    -0.00000000390072,
                    -0.000000006663576,
                    -0.000000009425328,
                    -0.000000007579212,
                    -0.00000000174702,
                    0.0000000004319688,
                    -0.00000000273582,
                    -0.000000006091488,
                    -0.000000008259408,
                    -0.000000005588364,
                    0.000000002996916,
                    0.000000009872064,
                    0.00000001293324,
                    0.00000001224768,
                    0.0000000095121,
                    0.000000007493808,
                    0.00000000479538,
                    0.0000000000634806,
                    -0.000000002868744,
                    -0.000000005323224,
                    -0.000000004539372,
                    -0.000000002059464,
                    -0.00000000345444,
                    -0.000000005997036,
                    -0.000000005425812,
                    -0.000000005438892,
                    -0.000000003276324,
                    0.0000000008052444,
                    -0.0000000003120936,
                    -0.000000002212008,
                    -0.00000000011126832,
                    0.000000001770444,
                    0.00000000652362,
                    0.000000010362408,
                    0.000000005628348,
                    -0.00000000004651632,
                    -0.00000000389736,
                    -0.00000000511566,
                    -0.0000000012444,
                    0.00000000268176,
                    0.000000002483268,
                    0.0000000011782116,
                    -0.000000001650036,
                    -0.000000004913796,
                    -0.000000005084472,
                    -0.000000002790588,
                    -0.00000000205062,
                    -0.0000000010899396,
                    -0.0000000007671792,
                    -0.000000001112586,
                    0.00000000144834,
                    0.0000000032121,
                    0.000000003828924,
                    0.00000000567516,
                    0.000000003179352,
                    0.000000000112668,
                    -0.0000000008799636,
                    -0.0000000017922,
                    0.000000000619746,
                    0.00000000238602,
                    0.00000000003505164,
                    -0.000000002034468,
                    -0.00000000246978,
                    -0.0000000011683008,
                    0.000000001798284,
                    0.0000000024792,
                    0.0000000010989732,
                    0.0000000002554848,
                    0.00000000002904324,
                    -0.000000001373004,
                    -0.0000000028878,
                    -0.000000002820756,
                    -0.000000001436592,
                    0.000000002520636,
                    0.000000004896276,
                    0.000000001255056,
                    -0.00000000295464,
                    -0.000000004947264,
                    -0.000000004172856,
                    0.00000000003625128,
                    0.000000003125472,
                    0.0000000008782332,
                    -0.000000002254092,
                    -0.000000003201288,
                    -0.0000000006636672,
                    0.000000003608304,
                    0.000000006768612,
                    0.00000000386922,
                    -0.0000000008015748,
                    -0.000000002829024,
                    -0.000000001337376,
                    0.0000000005503944,
                    0.0000000004282116,
                    -0.0000000010506648,
                    -0.000000001796952,
                    -0.0000000005149272,
                    0.000000001729512,
                    0.000000001961952,
                    0.0000000006173172,
                    -0.0000000011776788,
                    -0.00000000336264,
                    -0.000000003519072,
                    -0.000000002034408,
                    -0.0000000004465248,
                    0.0000000004861788,
                    0.000000002518668,
                    0.00000000406896,
                    0.000000003963756,
                    0.00000000221796,
                    0.0000000003568368,
                    -0.0000000002819844,
                    0.000000002450016,
                    0.000000003483828,
                    0.000000001428804,
                    -0.0000000009644928,
                    -0.00000000283764,
                    -0.000000002544708,
                    -0.000000001816056,
                    -0.00000000263988,
                    -0.00000000329376,
                    -0.00000000442734,
                    -0.000000004189644,
                    -0.00000000406794,
                    -0.000000003770232,
                    -0.0000000004487436,
                    0.000000002610756,
                    0.000000005402244,
                    0.000000006536784,
                    0.000000002486076,
                    -0.0000000006689532,
                    0.0000000011108568,
                    0.000000004349784,
                    0.000000006915048,
                    0.000000006049812,
                    0.00000000085155,
                    -0.000000004517544,
                    -0.00000000576036,
                    -0.000000004705752,
                    -0.000000002724612,
                    -0.0000000008638716,
                    -0.000000002675976,
                    -0.000000004356192,
                    -0.000000001511952,
                    0.000000002494572,
                    0.0000000049347,
                    0.000000003823536,
                    0.0000000008650836,
                    -0.000000001535808,
                    -0.000000001497612,
                    -0.0000000004631736,
                    -0.000000001236768,
                    -0.000000001951704,
                    0.0000000007001508,
                    0.000000002593824,
                    0.000000004155612,
                    0.000000004138584,
                    0.00000000074589,
                    -0.00000000266838,
                    -0.000000002655924,
                    -0.0000000001255488,
                    0.000000002237136,
                    0.000000002621028,
                    -0.0000000010475124,
                    -0.000000004830432,
                    -0.000000003534432,
                    -0.000000000660174,
                    0.0000000001380984,
                    -0.0000000004549104,
                    -0.000000003620076,
                    -0.0000000049731,
                    -0.000000001931184,
                    0.00000000190746,
                    0.000000002329284,
                    0.0000000003548952,
                    -0.0000000005460972,
                    0.00000000178056,
                    0.00000000522978,
                    0.000000007570272,
                    0.000000006001944,
                    0.00000000263886,
                    0.000000001397484,
                    0.0000000010393176,
                    -0.0000000011358408,
                    -0.000000004254744,
                    -0.000000006202332,
                    -0.000000006567936,
                    -0.000000003948288,
                    -0.0000000004756248,
                    -0.0000000010207548,
                    -0.000000002548956,
                    -0.000000002290536,
                    -0.00000000158238,
                    0.000000001352532,
                    0.000000004116732,
                    0.000000003742836,
                    0.00000000456426,
                    0.000000008384196,
                    0.000000009131904,
                    0.000000006374208,
                    0.000000002452476,
                    -0.000000002566812,
                    -0.000000005618736,
                    -0.000000006866304,
                    -0.0000000106074,
                    -0.00000001176618,
                    -0.000000008516124,
                    -0.000000003597936,
                    0.000000002201988,
                    0.000000004176468,
                    0.0000000025257,
                    0.000000001896684,
                    0.000000002140704,
                    0.000000004790136,
                    0.000000006311436,
                    0.000000003689748,
                    0.0000000006213864,
                    -0.00000000006641604,
                    0.000000000778878,
                    0.00000000405708,
                    0.0000000046377,
                    -0.0000000006619788,
                    -0.0000000062529,
                    -0.000000006722364,
                    -0.000000005853384,
                    -0.000000003145884,
                    -0.00000000006797472,
                    -0.000000001426344,
                    -0.0000000006968964,
                    0.000000003056172,
                    0.000000004078836,
                    0.00000000400056,
                    0.000000002538456,
                    -0.0000000005166288,
                    0.000000000307506,
                    0.0000000016242,
                    0.000000001558356,
                    0.000000001408476,
                    0.0000000011411508,
                    0.000000001250616,
                    0.000000001874868,
                    0.00000000021753,
                    -0.00000000307548,
                    -0.000000006451092,
                    -0.000000007499892,
                    -0.000000004875036,
                    0.0000000000738828,
                    0.000000002651724,
                    0.000000002545536,
                    0.000000001297356,
                    -0.0000000002052336,
                    -0.00000000008753508,
                    0.0000000001349196,
                    -0.0000000009966696,
                    -0.00000000111948,
                    -0.00000000004516308,
                    0.0000000004395492,
                    0.0000000008361552,
                    0.000000001055766,
                    0.0000000008889204,
                    0.000000001608708,
                    0.000000002146416,
                    0.0000000007038444,
                    -0.0000000003844944,
                    -0.0000000010811484,
                    -0.000000002489136,
                    -0.000000002490432,
                    -0.000000001324008,
                    -0.0000000006831372,
                    0.0000000010538112,
                    0.000000002519556,
                    0.000000003635244,
                    0.000000004778136,
                    0.00000000439902,
                    0.000000001913064,
                    -0.0000000011603448,
                    -0.000000002725104,
                    -0.000000002290752,
                    -0.0000000006294192,
                    0.000000001309356,
                    0.0000000004732032,
                    -0.0000000010088232,
                    -0.000000002025276,
                    -0.000000003661656,
                    -0.000000004433388,
                    -0.000000003829668,
                    -0.000000002498208,
                    0.000000000121368,
                    0.000000001987044,
                    0.000000002866896,
                    0.000000001749612,
                    0.0000000007762188,
                    0.000000001869528,
                    0.000000002412336,
                    0.000000003354816,
                    0.000000002910744,
                    -0.0000000002790756,
                    -0.0000000027693,
                    -0.000000002707152,
                    -0.0000000011505324,
                    0.000000000732684,
                    -0.00000000019863,
                    -0.000000003080556,
                    -0.000000005015808,
                    -0.000000003643368,
                    -0.000000001413048,
                    -0.0000000009248976,
                    -0.000000001365108,
                    -0.00000000064713,
                    0.000000001738104,
                    0.000000004389996,
                    0.000000005639364,
                    0.000000005272596,
                    0.000000004365648,
                    0.0000000047373,
                    0.000000004322388,
                    0.00000000178446,
                    -0.0000000008985708,
                    -0.000000003277428,
                    -0.000000002163072,
                    0.000000001380228,
                    0.000000001560612,
                    -0.000000002332584,
                    -0.000000007351872,
                    -0.00000001017696,
                    -0.000000007434156,
                    -0.000000002001204,
                    0.000000001238628,
                    0.000000001566912,
                    0.000000001910604,
                    0.000000003035112,
                    0.000000004274508,
                    0.000000004442892,
                    0.000000002421828,
                    0.0000000004072632,
                    0.0000000008035716,
                    0.000000001310532,
                    0.00000000093987,
                    -0.0000000010226592,
                    -0.000000003139488,
                    -0.000000003134652,
                    -0.0000000006887676,
                    0.000000001565364,
                    0.0000000004819776,
                    -0.000000002522316,
                    -0.000000004208388,
                    -0.000000004684968,
                    -0.000000002670612,
                    0.000000000135426,
                    0.0000000010529604,
                    0.000000001697508,
                    0.000000003599472,
                    0.000000004598124,
                    0.000000004291392,
                    0.000000002417064,
                    -0.000000000304002,
                    -0.0000000007607076,
                    0.000000002045916,
                    0.000000003518856,
                    0.00000000193914,
                    -0.000000000213078,
                    -0.000000002249304,
                    -0.000000002090556,
                    -0.0000000010911708,
                    -0.000000001219572,
                    -0.00000000253494,
                    -0.000000003084432,
                    -0.000000002678712,
                    -0.000000001793196,
                    -0.0000000010085148,
                    0.0000000001874448,
                    0.0000000001391376,
                    0.000000000180546,
                    0.0000000011937228,
                    0.00000000236742,
                    0.000000002339412,
                    0.0000000011816136,
                    0.000000000793128,
                    0.0000000007723488,
                    0.0000000011178312,
                    0.000000001456944,
                    -0.0000000008349804,
                    -0.000000002027424,
                    -0.0000000005375496,
                    0.00000000010578648,
                    0.000000001512948,
                    0.000000001403724,
                    -0.000000002520132,
                    -0.000000005079372,
                    -0.000000004543476,
                    -0.000000003123708,
                    -0.00000000010010328,
                    0.000000002391924,
                    0.000000002530776,
                    0.000000002089608,
                    0.0000000022989,
                    0.000000001149162,
                    0.00000000005084916,
                    0.0000000001238808,
                    0.000000000223098,
                    0.000000001459476,
                    0.000000002361216,
                    0.0000000010452072,
                    0.0000000002053656,
                    -0.0000000007343376,
                    -0.0000000005275164,
                    0.0000000007004304,
                    -0.000000000377748,
                    -0.000000002222376,
                    -0.00000000254736,
                    -0.00000000225036,
                    -0.00000000014298,
                    0.000000001382364,
                    0.0000000001982904,
                    0.000000000369042,
                    0.000000001923612,
                    0.000000001647516,
                    0.00000000159816,
                    0.0000000004985736,
                    -0.00000000264828,
                    -0.000000003463284,
                    -0.00000000202434,
                    -0.0000000011412684,
                    0.000000000205872,
                    0.0000000002492076,
                    -0.000000001411752,
                    -0.0000000006149892,
                    0.000000001590108,
                    0.000000002368836,
                    0.000000001342536,
                    0.0000000002564064,
                    0.0000000002157228,
                    0.000000002188968,
                    0.00000000368562,
                    0.000000002274312,
                    -0.0000000005377308,
                    -0.000000001555452,
                    -0.0000000009241488,
                    0.00000000006883968,
                    -0.0000000010069428,
                    -0.000000003335028,
                    -0.000000004657308,
                    -0.000000004408908,
                    -0.0000000011290068,
                    0.000000001712436,
                    0.000000001871784,
                    0.00000000190404,
                    0.00000000171636,
                    0.0000000011735388,
                    0.0000000009682056,
                    -0.0000000003703524,
                    -0.000000001748988,
                    -0.000000001551468,
                    0.0000000005556048,
                    0.000000002770068,
                    0.000000004130616,
                    0.000000004179036,
                    0.000000002688588,
                    0.000000001637652,
                    0.000000001267668,
                    -0.00000000131172,
                    -0.000000004043112,
                    -0.000000005565312,
                    -0.000000005548032,
                    -0.000000003286428,
                    -0.00000000156984,
                    -0.00000000166314,
                    -0.000000001434468,
                    -0.000000000282018,
                    0.000000001475256,
                    0.000000002263056,
                    0.000000002185752,
                    0.000000001739856,
                    0.000000002232576,
                    0.00000000370158,
                    0.0000000043515,
                    0.000000003331068,
                    0.000000001644732,
                    0.000000000028908,
                    -0.0000000005963796,
                    -0.0000000005660112,
                    -0.000000001629432,
                    -0.000000004513068,
                    -0.000000006247068,
                    -0.000000005044524,
                    -0.000000002375184,
                    0.0000000003421476,
                    0.0000000007816104,
                    -0.0000000006110784,
                    -0.0000000003532596,
                    0.000000001270848,
                    0.000000002428764,
                    0.000000002944788,
                    0.0000000018162,
                    0.000000000672036,
                    0.0000000005392212,
                    0.000000001627476,
                    0.000000002290524,
                    0.000000002281608,
                    0.000000001755264,
                    0.00000000105372,
                    0.000000000255714,
                    -0.00000000005993676,
                    -0.0000000011290416,
                    -0.000000003079152,
                    -0.000000004765188,
                    -0.000000004703496,
                    -0.000000003531456,
                    -0.000000002163408,
                    -0.0000000009211044,
                    -0.0000000011017344,
                    -0.0000000001721928,
                    0.000000002825808,
                    0.0000000049911,
                    0.000000005021256,
                    0.00000000316824,
                    0.0000000005180316,
                    -0.00000000005408472,
                    0.0000000007787964,
                    0.0000000009177348,
                    -0.0000000001887,
                    -0.0000000011574168,
                    -0.000000001344228,
                    -0.0000000006297696,
                    0.0000000001256244,
                    -0.0000000001798008,
                    -0.000000001624692,
                    -0.000000002230608,
                    -0.000000001531524,
                    -0.00000000006013272,
                    0.0000000005578236,
                    -0.00000000004557756,
                    -0.000000001061754,
                    -0.0000000009591948,
                    0.0000000004101648,
                    0.0000000006958212,
                    0.0000000000634194,
                    0.00000000009257856,
                    0.0000000003086076,
                    0.000000001606476,
                    0.000000002074872,
                    0.000000000527772,
                    -0.000000000414408,
                    -0.00000000002845644,
                    0.0000000008431116,
                    0.000000001558248,
                    0.0000000009347172,
                    -0.0000000006357396,
                    -0.000000001805172,
                    -0.0000000013596,
                    -0.0000000006778776,
                    -0.0000000007401732,
                    -0.0000000008841948,
                    -0.000000001661976,
                    -0.0000000010459296,
                    0.0000000008894604,
                    0.00000000109266,
                    0.0000000004698336,
                    0.00000000014688,
                    0.0000000002080932,
                    0.000000001575936,
                    0.000000002089224,
                    0.0000000011887704,
                    -0.0000000005766312,
                    -0.000000001407276,
                    -0.0000000004168608,
                    0.0000000005840592,
                    -0.00000000055458,
                    -0.0000000022227,
                    -0.000000002622468,
                    -0.000000001194762,
                    0.000000001301772,
                    0.00000000261414,
                    0.000000001417068,
                    0.000000000486372,
                    0.000000001470372,
                    0.0000000016944,
                    0.000000001829304,
                    0.0000000011147676,
                    -0.000000001470588,
                    -0.000000002784492,
                    -0.000000002105196,
                    -0.000000002105796,
                    -0.000000001150008,
                    -0.0000000001310592,
                    -0.0000000005046996,
                    0.0000000002692728,
                    0.000000001724196,
                    0.0000000008278212,
                    -0.0000000008178888,
                    -0.000000002218392,
                    -0.00000000243354,
                    -0.00000000005102184,
                    0.000000002310624,
                    0.000000002653044,
                    0.000000002369892,
                    0.0000000010493256,
                    0.0000000004594356,
                    0.0000000008542428,
                    0.0000000002789076,
                    -0.000000000167496,
                    -0.0000000005819064,
                    -0.000000001305348,
                    -0.0000000009542988,
                    -0.0000000009278664,
                    -0.000000001617828,
                    -0.000000001425816,
                    -0.0000000006647172,
                    -0.0000000005745888,
                    -0.000000000130644,
                    0.0000000003935124,
                    -0.00000000005594544,
                    0.0000000008444904,
                    0.000000002394636,
                    0.000000001920612,
                    0.000000001558896,
                    0.000000001280292,
                    -0.00000000004852992,
                    0.000000000413784,
                    0.0000000011608776,
                    0.0000000009790704,
                    0.000000000565368,
                    -0.0000000002463468,
                    -0.0000000011151372,
                    -0.000000001693068,
                    -0.000000002594592,
                    -0.00000000336708,
                    -0.000000003463284,
                    -0.000000001698312,
                    0.00000000028101,
                    0.000000001362396,
                    0.000000001475736,
                    0.0000000006925044,
                    -0.00000000051384,
                    -0.0000000007309284,
                    0.0000000003108312,
                    0.00000000145596,
                    0.000000001426092,
                    0.000000001204152,
                    0.000000001293732,
                    0.00000000158736,
                    0.000000002383776,
                    0.0000000012876,
                    -0.0000000009462216,
                    -0.000000001733964,
                    -0.0000000010167012,
                    -0.0000000005914032,
                    -0.0000000005549112,
                    -0.000000001541316,
                    -0.000000002716632,
                    -0.00000000221064,
                    -0.0000000009001044,
                    -0.0000000009575988,
                    -0.0000000011088384,
                    -0.0000000008859756,
                    0.0000000001649568,
                    0.00000000278112,
                    0.000000004948572,
                    0.000000004761612,
                    0.0000000031149,
                    0.00000000173454,
                    0.00000000128172,
                    0.0000000007467312,
                    -0.0000000001530012,
                    -0.000000001896504,
                    -0.00000000327,
                    -0.00000000247038,
                    -0.0000000007298928,
                    -0.000000000105831,
                    -0.0000000007762548,
                    -0.00000000211554,
                    -0.000000002430348,
                    -0.0000000010435236,
                    -0.00000000004181136,
                    -0.0000000010676988,
                    -0.000000002333496,
                    -0.000000001855236,
                    0.000000000296628,
                    0.000000003078528,
                    0.000000003946644,
                    0.000000002146512,
                    0.0000000007756764,
                    0.0000000005736624,
                    0.0000000008655828,
                    0.0000000011081748,
                    -0.0000000001605924,
                    -0.000000001442064,
                    -0.000000001539048,
                    -0.000000000564936,
                    0.0000000002486316,
                    -0.00000000002469528,
                    -0.0000000008638776,
                    -0.0000000009165564,
                    0.0000000002528328,
                    0.000000001743408,
                    0.000000001459044,
                    0.00000000006604404,
                    -0.0000000009093072,
                    -0.0000000005204448,
                    -0.00000000004824828,
                    -0.000000000003159144,
                    -0.0000000001913832,
                    -0.0000000006392208,
                    0.000000000110781,
                    0.000000001532604,
                    0.000000001794996,
                    0.000000001423668,
                    0.0000000004089048,
                    -0.0000000011564508,
                    -0.000000001213212,
                    -0.0000000005643468,
                    0.0000000002119608,
                    0.0000000001597272,
                    -0.0000000003880476,
                    -0.0000000008436192,
                    -0.0000000010416324,
                    -0.0000000003591432,
                    0.0000000005048016,
                    0.0000000002776512,
                    0.0000000001810788,
                    -0.0000000003780528,
                    -0.000000001428456,
                    -0.000000001841604,
                    -0.00000000157026,
                    -0.0000000005948328,
                    0.0000000005156952,
                    0.0000000009468276,
                    0.000000000243828,
                    -0.000000000664806,
                    -0.0000000001717284,
                    0.000000001005858,
                    0.000000002451756,
                    0.0000000033144,
                    0.000000002356848,
                    0.0000000009330324,
                    -0.0000000001510092,
                    -0.0000000011415264,
                    -0.000000001245228,
                    -0.0000000008273592,
                    -0.000000001211736,
                    -0.000000001559472,
                    -0.000000001282056,
                    -0.0000000003942576,
                    0.0000000008885928,
                    0.000000001702272,
                    0.000000001237392,
                    0.0000000005968476,
                    0.000000000182766,
                    -0.0000000005329164,
                    -0.0000000009497508,
                    -0.000000000594642,
                    0.00000000005565372,
                    0.0000000011246652,
                    0.0000000009859188,
                    -0.0000000002736336,
                    -0.0000000011250684,
                    -0.0000000007291332,
                    0.0000000003886632,
                    0.000000001426236,
                    0.0000000009355464,
                    -0.000000000804864,
                    -0.00000000204768,
                    -0.000000002242428,
                    -0.000000001376448,
                    0.0000000001602828,
                    -9.365364E-13,
                    -0.0000000004710636,
                    0.0000000001294752,
                    0.0000000004364916,
                    0.000000001410588,
                    0.00000000165174,
                    0.00000000008619408,
                    -0.0000000002827428,
                    0.0000000001810044,
                    -0.0000000001433064,
                    0.0000000002388708,
                    -0.0000000000444384,
                    -0.00000000062763,
                    0.0000000003729852,
                    0.000000001766592,
                    0.000000001317888,
                    0.0000000001940028,
                    -0.0000000007657284,
                    -0.000000001341528,
                    -0.0000000007398372,
                    0.0000000002543376,
                    0.00000000001308408,
                    -0.0000000002720736,
                    -0.000000000250074,
                    0.0000000001872108,
                    0.000000001289088,
                    0.0000000011018004,
                    0.0000000001490484,
                    -0.0000000005335788,
                    -0.000000001062996,
                    0.00000000005074632,
                    0.000000000823188,
                    -0.0000000003748296,
                    -0.000000001438368,
                    -0.000000001663848,
                    -0.0000000009903612,
                    0.000000000448218,
                    0.0000000005050068,
                    -0.0000000007279932,
                    -0.0000000004306968,
                    0.0000000011499108,
                    0.000000001943052,
                    0.00000000202062,
                    0.00000000129432,
                    -0.00000000007089936,
                    -0.0000000002165064,
                    -0.00000000010670124,
                    -0.0000000010288812,
                    -0.000000002040804,
                    -0.000000002418264,
                    -0.000000001990872,
                    -0.00000000050388,
                    0.0000000007029216,
                    0.000000000537306,
                    -0.0000000001687368,
                    0.0000000001937772,
                    0.000000001053108,
                    0.000000001792548,
                    0.000000001744068,
                    0.0000000010731468,
                    0.000000000574818,
                    0.0000000007903284,
                    0.000000000972972,
                    0.0000000003235356,
                    -0.0000000008037492,
                    -0.0000000009388308,
                    -0.0000000006243588,
                    -0.0000000003568992,
                    0.00000000006422124,
                    -0.0000000006674376,
                    -0.0000000015591,
                    -0.0000000011435232,
                    -0.0000000003842892,
                    -0.00000000010203996,
                    -0.0000000001246056,
                    -0.000000000620526,
                    -0.0000000009869688,
                    -0.0000000005377392,
                    0.0000000004055496,
                    0.0000000007400544,
                    0.000000001424076,
                    0.000000001496928,
                    0.0000000010273392,
                    0.00000000129432,
                    0.000000001635828,
                    0.0000000010812228,
                    0.00000000008771388,
                    -0.0000000007830096,
                    -0.0000000011849292,
                    -0.000000001316664,
                    -0.000000001308636,
                    -0.000000001709244,
                    -0.000000002063844,
                    -0.0000000010108752,
                    0.00000000003553344,
                    0.0000000003478008,
                    0.0000000007488768,
                    0.0000000006826128,
                    0.0000000003479256,
                    0.000000000710922,
                    0.0000000011320512,
                    0.000000000972522,
                    0.0000000006231696,
                    0.00000000006493716,
                    -0.000000000611454,
                    -0.0000000000417414,
                    0.00000000074472,
                    0.0000000005342796,
                    0.000000000459846,
                    0.0000000003284952,
                    0.00000000005750892,
                    0.00000000001013814,
                    -0.0000000007471392,
                    -0.000000001280856,
                    -0.000000001404768,
                    -0.000000000739752,
                    0.0000000002333688,
                    0.0000000002371848,
                    -0.0000000001398084,
                    -0.000000000246708,
                    0.00000000006855228,
                    0.0000000009523236,
                    0.000000000662952,
                    -0.0000000003462216,
                    -0.0000000008883924,
                    -0.000000000607962,
                    -0.00000000006669504,
                    0.0000000001664436,
                    -0.0000000003194868,
                    -0.0000000007285128,
                    -0.000000000286488,
                    0.0000000006811296,
                    0.0000000014667,
                    0.000000001773396,
                    0.000000001511784,
                    0.0000000006187884,
                    0.0000000001826076,
                    0.000000000006909048,
                    -0.0000000003947016,
                    -0.00000000117042,
                    -0.000000001791732,
                    -0.000000001945944,
                    -0.000000001467372,
                    -0.0000000009699972,
                    -0.000000000426078,
                    0.0000000000954462,
                    0.000000001334508,
                    0.000000002094228,
                    0.000000001964352,
                    0.00000000141582,
                    0.0000000008807652,
                    0.0000000004389192,
                    0.0000000003925584,
                    0.0000000004381572,
                    -0.0000000004071204,
                    -0.000000001293924,
                    -0.0000000016083,
                    -0.000000001714584,
                    -0.0000000010544604,
                    -0.000000000211572,
                    -0.0000000003564924,
                    -0.0000000005154264,
                    -0.0000000002495184,
                    0.0000000001648656,
                    0.0000000006179376,
                    0.000000000813864,
                    0.0000000006317028,
                    0.000000000708648,
                    0.000000001318236,
                    0.00000000123,
                    0.0000000002299812,
                    -0.0000000007567884,
                    -0.000000001412076,
                    -0.0000000010518504,
                    -0.0000000002948796,
                    -0.0000000006822204,
                    -0.0000000011240796,
                    -0.0000000008758176,
                    -0.0000000003893784,
                    0.0000000011201244,
                    0.000000001689876,
                    0.0000000011083356,
                    0.0000000009048408,
                    0.0000000005309448,
                    0.0000000004159416,
                    0.0000000005625408,
                    -0.00000000006579348,
                    -0.0000000006631932,
                    -0.0000000008436936,
                    -0.0000000006803748,
                    0.00000000010297584,
                    0.0000000008795172,
                    0.000000000431496,
                    -0.0000000003023292,
                    -0.00000000040059,
                    -0.0000000004039044,
                    -0.00000000017103,
                    -0.0000000000787476,
                    -0.0000000009966492,
                    -0.000000001349232,
                    -0.000000000749358,
                    -0.000000000413028,
                    0.0000000007514472,
                    0.00000000165138,
                    0.0000000015762,
                    0.000000001800996,
                    0.000000001397004,
                    -0.0000000001342344,
                    -0.0000000011083944,
                    -0.000000002099988,
                    -0.000000002479356,
                    -0.000000001351932,
                    0.00000000009859044,
                    0.0000000004849188,
                    0.0000000004666128,
                    0.00000000012129,
                    0.000000000188892,
                    0.000000000967218,
                    0.000000001186128,
                    0.0000000005032764,
                    -0.0000000005769636,
                    -0.00000000148242,
                    -0.0000000011216472,
                    0.000000000001818696,
                    0.000000000975048,
                    0.000000001718532,
                    0.000000001394304,
                    0.000000000703224,
                    0.0000000004447872,
                    0.00000000016929,
                    -0.0000000003975588,
                    -0.0000000003902568,
                    -0.0000000001680324,
                    -0.000000000365076,
                    -0.0000000003319848,
                    -0.0000000007410444,
                    -0.00000000182418,
                    -0.000000001594596,
                    -0.0000000002630544,
                    0.000000000706752,
                    0.0000000011909856,
                    0.000000000945474,
                    0.0000000002751444,
                    0.0000000002713848,
                    0.0000000005814324,
                    0.0000000004918416,
                    -0.0000000001663344,
                    -0.000000000244626,
                    0.000000000005218608,
                    0.00000000009937008,
                    -0.0000000001892064,
                    -0.0000000008006808,
                    -0.0000000008863788,
                    -0.000000000171594,
                    0.0000000003126888,
                    0.0000000000353604,
                    -0.0000000007332192,
                    -0.0000000008278716,
                    -0.0000000004048308,
                    0.0000000003315036,
                    0.000000001240572,
                    0.0000000007383132,
                    -0.0000000002905512,
                    -0.0000000004814436,
                    -0.0000000002014728,
                    0.0000000003581856,
                    0.0000000009404892,
                    0.000000000516984,
                    -0.00000000008151396,
                    -0.00000000003010824,
                    0.0000000003903504,
                    0.00000000005099184,
                    -0.00000000002785008,
                    -0.00000000010657416,
                    -0.00000000007922628,
                    0.0000000002468604,
                    0.00000000006141276,
                    -0.000000000577092,
                    -0.000000000577086,
                    0.00000000006033264,
                    0.0000000006151728,
                    0.000000000396606,
                    0.0000000000775116,
                    -0.0000000003210576,
                    -0.000000000637548,
                    0.000000000009764052,
                    0.00000000010927428,
                    -0.000000000522828,
                    -0.0000000004816776,
                    -0.0000000002617584,
                    0.00000000007704564,
                    0.0000000007753968,
                    0.0000000005704728,
                    0.00000000009606372,
                    0.00000000009551772,
                    0.000000000275754,
                    0.0000000004136064,
                    0.0000000004910772,
                    -0.0000000000991632,
                    -0.0000000011768484,
                    -0.000000001498488,
                    -0.0000000011341896,
                    -0.00000000074472,
                    -0.0000000001671348,
                    0.0000000003545364,
                    0.0000000005465256,
                    0.0000000007248816,
                    0.000000000897102,
                    0.0000000006267432,
                    0.00000000035373,
                    0.000000000494628,
                    0.0000000003013152,
                    -0.0000000002864748,
                    -0.0000000004227444,
                    -0.000000000423564,
                    -0.0000000003760476,
                    -0.0000000001718784,
                    0.000000000011007768,
                    0.000000000168936,
                    0.0000000004108356,
                    0.0000000002967108,
                    0.00000000002522016,
                    0.00000000021591,
                    0.0000000005527356,
                    0.0000000003109572,
                    -0.0000000002305356,
                    -0.0000000007418508,
                    -0.0000000007606272,
                    -0.000000000230346,
                    0.0000000002896728,
                    0.0000000005404128,
                    0.0000000004343184,
                    0.0000000002103168,
                    0.000000000188376,
                    0.0000000000799782,
                    -0.0000000001750716,
                    -0.0000000003345372,
                    -0.0000000006855132,
                    -0.0000000004462572,
                    -0.0000000002404224,
                    -0.0000000002648772,
                    -0.0000000003172932,
                    -0.000000000513336,
                    -0.0000000005635632,
                    -0.00000000007805808,
                    0.0000000004427976,
                    0.0000000009182604,
                    0.0000000010629468,
                    0.0000000007211256,
                    0.00000000000556782,
                    -0.0000000004669956,
                    -0.000000000009876984,
                    0.00000000006322884,
                    -0.00000000003468168,
                    0.00000000008918292,
                    -0.0000000003925392,
                    -0.0000000007324968,
                    -0.00000000065184,
                    -0.000000000924672,
                    -0.0000000003540888,
                    0.0000000004943016,
                    0.0000000007921704,
                    0.0000000008730564,
                    0.0000000006744972,
                    0.00000000011301072,
                    0.00000000013947,
                    0.0000000008063256,
                    0.000000001219332,
                    0.0000000009879384,
                    0.0000000000270462,
                    -0.0000000011146104,
                    -0.0000000011404716,
                    -0.0000000006428172,
                    -0.0000000004861788,
                    -0.0000000003125976,
                    -0.0000000002940396,
                    -0.0000000001448496,
                    0.000000000444924,
                    0.00000000016407,
                    -0.0000000002968848,
                    -0.000000000225534,
                    -0.0000000001763292,
                    -0.00000000011923524,
                    0.00000000002054412,
                    -0.0000000004816908,
                    -0.0000000005715132,
                    0.0000000002140332,
                    0.0000000006731772,
                    0.0000000009146748,
                    0.0000000007045548,
                    -0.0000000001357068,
                    -0.000000000196884,
                    0.000000000181794,
                    -0.000000000075783,
                    0.0000000001464096,
                    0.0000000003905124,
                    0.0000000004340412,
                    0.0000000005014572,
                    -0.0000000002602476,
                    -0.000000001749564,
                    -0.000000002367084,
                    -0.000000001875816,
                    -0.0000000003500352,
                    0.000000001293048,
                    0.000000001792356,
                    0.0000000007462776,
                    0.00000000008383632,
                    0.0000000004224732,
                    0.000000001252212,
                    0.00000000161904,
                    0.0000000005588796,
                    -0.0000000007078716,
                    -0.00000000074841,
                    -0.0000000002136324,
                    0.0000000003489432,
                    0.0000000001611996,
                    -0.0000000006771252,
                    -0.0000000008961312,
                    -0.00000000079131,
                    -0.0000000003333264,
                    -0.00000000006305772,
                    -0.0000000000733896,
                    -0.00000000001724028,
                    0.000000000409998,
                    0.00000000088317,
                    0.0000000009273216,
                    0.0000000005558628,
                    -0.000000000232554,
                    -0.000000001186116,
                    -0.0000000009767808,
                    -0.000000000514944,
                    -0.0000000005071644,
                    -0.0000000004353504,
                    -0.0000000005075628,
                    -0.0000000004177164,
                    0.000000000391242,
                    0.000000001203048,
                    0.000000001229232,
                    0.0000000008567292,
                    0.0000000005834196,
                    0.0000000003152808,
                    0.000000000259332,
                    0.000000000245544,
                    -0.000000000245832,
                    -0.0000000008970516,
                    -0.0000000009285276,
                    -0.0000000005964888,
                    -0.0000000002707536,
                    -0.0000000001892772,
                    -0.000000000143652,
                    -0.00000000039,
                    -0.0000000002878308,
                    0.0000000005426304,
                    0.0000000006228936,
                    0.0000000003134436,
                    0.0000000003991884,
                    0.0000000002075544,
                    0.0000000001252944,
                    0.0000000003200616,
                    0.00000000005317572,
                    -0.00000000006846588,
                    0.00000000009337464,
                    0.0000000001344708,
                    -0.0000000001982628,
                    -0.0000000003799488,
                    -0.0000000001803912,
                    0.0000000002158008,
                    0.000000000494736,
                    0.0000000003931596,
                    -0.0000000001467132,
                    -0.0000000004531908,
                    -0.000000000478644,
                    -0.0000000005368524,
                    -0.000000000560754,
                    -0.0000000002976348,
                    -0.0000000004581636,
                    -0.0000000005109012,
                    0.00000000007057596,
                    0.0000000004146336,
                    0.0000000005863656,
                    0.0000000009406212,
                    0.0000000008707368,
                    0.0000000007224036,
                    0.0000000008618304,
                    0.0000000003607992,
                    -0.0000000006138576,
                    -0.000000001169868,
                    -0.0000000011118348,
                    -0.000000000893562,
                    -0.0000000004046472,
                    -0.000000000307632,
                    -0.0000000006014628,
                    -0.0000000003854712,
                    0.0000000002852724,
                    0.0000000007028208,
                    0.0000000009270576,
                    0.0000000007742568,
                    0.0000000003280752,
                    0.0000000002770908,
                    0.000000000755148,
                    0.0000000009109848,
                    0.0000000005475864,
                    0.0000000002163504,
                    -0.0000000000905274,
                    -0.0000000002812308,
                    -0.0000000001955136,
                    -0.0000000006273492,
                    -0.000000001225536,
                    -0.0000000011351352,
                    -0.0000000009571368,
                    -0.0000000004620084,
                    0.00000000006903264,
                    -0.00000000004941816,
                    0.000000000004935756,
                    0.0000000002623644,
                    0.0000000004439124,
                    0.0000000004308492,
                    0.0000000003353496,
                    0.0000000004165236,
                    0.0000000002326236,
                    0.0000000001466124,
                    0.00000000017175,
                    -0.00000000002198184,
                    0.00000000002334948,
                    0.0000000002769264,
                    0.0000000001928868,
                    0.0000000000528534,
                    -0.000000000248862,
                    -0.0000000003589236,
                    -0.0000000004079532,
                    -0.0000000001693548,
                    0.0000000001523484,
                    0.000000000101679,
                    -0.000000000266772,
                    -0.0000000002364228,
                    -0.00000000008085348,
                    0.0000000002929512,
                    0.0000000003951036,
                    0.000000000008924568,
                    -0.00000000007049232,
                    0.0000000002606388,
                    0.0000000002372436,
                    -0.00000000003266112,
                    -0.0000000003220428,
                    -0.000000000607872,
                    -0.000000000376224,
                    0.00000000010129224,
                    0.00000000009234552,
                    0.0000000000696912,
                    0.000000000225174,
                    0.00000000003128172,
                    0.000000000331278,
                    0.0000000005949924,
                    0.0000000003521076,
                    0.0000000001144182,
                    -0.00000000002542476,
                    -0.0000000003505428,
                    -0.0000000001787844,
                    0.0000000001702188,
                    -0.0000000001944816,
                    -0.0000000005269344,
                    -0.0000000005769408,
                    -0.000000000683676,
                    -0.0000000002151132,
                    0.0000000001774512,
                    0.00000000011046996,
                    0.000000000306288,
                    0.0000000002942412,
                    0.0000000004337232,
                    0.0000000006485832,
                    0.00000000003382716,
                    -0.0000000004259508,
                    -0.000000000454866,
                    -0.0000000005020212,
                    -0.0000000001749792,
                    0.0000000002526408,
                    0.000000000138816,
                    -0.00000000008220684,
                    0.00000000012246,
                    0.0000000003316992,
                    0.0000000007857744,
                    0.0000000011345904,
                    0.0000000003748872,
                    -0.00000000010641396,
                    0.00000000005411724,
                    0.00000000002902704,
                    0.0000000000208092,
                    -0.0000000005460804,
                    -0.0000000011201616,
                    -0.0000000007786212,
                    -0.000000000192396,
                    0.000000000002958432,
                    -0.0000000001487952,
                    -0.000000000468186,
                    -0.0000000004484328,
                    0.00000000006498516,
                    0.0000000005541372,
                    0.0000000005143188,
                    0.000000000124158,
                    -0.0000000003421968,
                    -0.0000000003406956,
                    0.0000000001979784,
                    0.0000000003825132,
                    -0.000000000003143688,
                    -0.0000000001012356,
                    0.0000000001340016,
                    0.0000000007230216,
                    0.0000000008655792,
                    0.0000000002936112,
                    -0.0000000002605908,
                    -0.0000000004104096,
                    -0.0000000001661376,
                    0.0000000001028412,
                    0.00000000002429172,
                    -0.0000000002706036,
                    -0.0000000003914256,
                    -0.0000000003388776,
                    -0.0000000004029072,
                    -0.0000000006106104,
                    -0.0000000005114148,
                    -0.00000000026055,
                    0.0000000007064112,
                    0.000000001291068,
                    0.000000000938964,
                    0.000000000429306,
                    0.00000000006848472,
                    0.00000000006512892,
                    0.0000000003392016,
                    0.000000000009745908,
                    -0.0000000006236148,
                    -0.000000001026522,
                    -0.0000000011189052,
                    -0.0000000007026972,
                    0.00000000008228952,
                    0.0000000005574864,
                    0.0000000005517072,
                    0.000000000278838,
                    0.0000000001763916,
                    0.0000000002777688,
                    0.0000000003965052,
                    0.0000000006154032,
                    0.0000000006944976,
                    0.0000000002785212,
                    -0.00000000016995,
                    -0.0000000006231732,
                    -0.000000001177032,
                    -0.0000000010387356,
                    -0.0000000005784,
                    -0.0000000005190144,
                    -0.0000000003494448,
                    -0.00000000007356552,
                    -0.0000000001072698,
                    0.00000000010480296,
                    0.0000000006615156,
                    0.0000000010252788,
                    0.0000000008242476,
                    0.0000000005202708,
                    0.00000000010147356,
                    -0.0000000001622808,
                    -0.00000000003327444,
                    0.0000000001321104,
                    -0.0000000001977756,
                    -0.0000000003030912,
                    -0.0000000002356548,
                    -0.0000000002972124,
                    -0.0000000001510548,
                    0.0000000001976316,
                    0.0000000003368772,
                    0.0000000004402812,
                    0.0000000006363204,
                    0.0000000001946304,
                    -0.0000000004982448,
                    -0.0000000004911408,
                    -0.0000000002188332,
                    0.0000000001866924,
                    0.0000000005296176,
                    0.00000000003895068,
                    -0.0000000004159428,
                    -0.000000000281394,
                    0.0000000001358868,
                    0.000000000309036,
                    0.0000000001003818,
                    -0.0000000002745312,
                    -0.0000000005183616,
                    -0.000000000509526,
                    -0.0000000002074872,
                    -0.0000000003487884,
                    -0.000000000347202,
                    -0.00000000011327244,
                    -0.0000000001604376,
                    0.00000000010637928,
                    0.000000000607194,
                    0.0000000004875096,
                    0.0000000003415224,
                    0.000000000357552,
                    0.0000000001903656,
                    0.0000000002660472,
                    0.000000000467478,
                    0.00000000031746,
                    -0.0000000002418444,
                    -0.0000000005614356,
                    -0.0000000006422172,
                    -0.000000000661698,
                    -0.000000000328008,
                    -0.0000000002465256,
                    -0.0000000003367164,
                    -0.0000000001319244,
                    0.000000000138864,
                    0.0000000004357824,
                    0.0000000007573188,
                    0.0000000006566076,
                    0.000000000318078,
                    0.0000000002727888,
                    0.0000000003746688,
                    0.0000000003160476,
                    0.00000000010095756,
                    -0.0000000003247656,
                    -0.0000000005470236,
                    -0.0000000002900832,
                    0.00000000004516512,
                    0.00000000011945004,
                    -0.0000000001076664,
                    -0.00000000005346996,
                    0.0000000003356892,
                    0.0000000005183304,
                    0.0000000002270844,
                    -0.0000000002636016,
                    -0.0000000006990708,
                    -0.0000000005123976,
                    -0.0000000002691732,
                    -0.0000000003763764,
                    -0.00000000071598,
                    -0.000000000762996,
                    -0.0000000005427216,
                    -0.00000000008160864,
                    0.000000000534366,
                    0.0000000004601592,
                    0.0000000003042528,
                    0.0000000007177944,
                    0.0000000007886088,
                    0.0000000007824324,
                    0.0000000006323832,
                    -0.000000000125274,
                    -0.00000000045726,
                    -0.0000000004105848,
                    -0.00000000042135,
                    -0.0000000004156056,
                    -0.000000000540108,
                    -0.000000000656022,
                    -0.0000000001825644,
                    0.0000000002804268,
                    0.0000000002134452,
                    0.0000000002433384,
                    0.0000000004739736,
                    0.0000000004911072,
                    0.0000000008343696,
                    0.0000000007538292,
                    0.0000000001946364,
                    0.000000000002150484,
                    -0.00000000013269,
                    -0.0000000001602228,
                    0.000000000043659,
                    -0.00000000011907852,
                    -0.0000000003411084,
                    -0.0000000004017768,
                    -0.0000000006517896,
                    -0.0000000005102976,
                    -0.0000000003004836,
                    -0.0000000003121356,
                    -0.0000000002335644,
                    0.00000000005475852,
                    0.0000000002771496,
                    0.0000000006023664,
                    0.0000000006573828,
                    0.0000000001461156,
                    -0.0000000001324644,
                    -0.00000000003305892,
                    -0.00000000007179924,
                    0.00000000008514816,
                    -0.00000000004260576,
                    -0.0000000003830148,
                    -0.0000000002672868,
                    -0.00000000001835424,
                    -0.00000000003965724,
                    -0.000000000145296,
                    -0.0000000002259264,
                    -0.0000000001954884,
                    -0.00000000006943224,
                    0.0000000001206144,
                    0.00000000009504252,
                    0.00000000004760136,
                    0.00000000006134412,
                    0.0000000001858392,
                    0.0000000003701124,
                    0.0000000003620328,
                    0.0000000001206756,
                    0.0000000001212348,
                    0.00000000007415256,
                    0.00000000010552608,
                    0.0000000001577412,
                    -0.0000000000458322,
                    -0.0000000000933678,
                    0.0000000000255864,
                    0.00000000001701084,
                    -0.00000000008065776,
                    -0.0000000001394616,
                    -0.0000000002813508,
                    -0.00000000009910824,
                    0.00000000005355648,
                    0.00000000006033612,
                    0.0000000001888128,
                    0.0000000002345448,
                    0.00000000005280444,
                    0.0000000001320612,
                    0.00000000011691696,
                    0.00000000007214028,
                    -0.000000000008285604,
                    -0.0000000002866908,
                    -0.0000000003740856,
                    -0.0000000001731408,
                    -0.0000000002574816,
                    -0.0000000004074444,
                    -0.000000000518988,
                    -0.0000000004644204,
                    -0.0000000001772376,
                    0.00000000002579904,
                    0.00000000009041724,
                    0.00000000008970552,
                    0.00000000011101032,
                    0.0000000003844176,
                    0.0000000005419224,
                    0.0000000004172556,
                    0.0000000002912256,
                    0.0000000001353672,
                    0.0000000001677708,
                    0.0000000003018504,
                    0.000000000230118,
                    -0.0000000001509036,
                    -0.000000000471204,
                    -0.0000000004088976,
                    -0.0000000002941272,
                    0.000000000005762232,
                    0.000000000145764,
                    -0.000000000135498,
                    -0.000000000230862,
                    -0.00000000010216692,
                    0.0000000001623444,
                    0.0000000005195556,
                    0.0000000005457576,
                    0.0000000002655996,
                    0.00000000007045368,
                    0.00000000011962752,
                    0.0000000001590084,
                    -0.0000000001928004,
                    -0.0000000002824008,
                    -0.0000000001610352,
                    -0.0000000002766492,
                    -0.0000000001823112,
                    -0.00000000017391,
                    -0.0000000004288476,
                    -0.0000000001791348,
                    0.000000000027237,
                    -0.000000000085602,
                    -0.000000000010006572,
                    0.0000000001905132,
                    0.0000000001574616,
                    0.000000000016311,
                    0.0000000001267152,
                    0.00000000008913324,
                    -0.0000000002394108,
                    -0.0000000001927236,
                    0.00000000004899804,
                    0.00000000007030476,
                    0.0000000001113858,
                    -0.00000000002425668,
                    -0.0000000002074272,
                    -0.00000000001953996,
                    0.0000000003620856,
                    0.000000000248544,
                    0.00000000009459072,
                    0.00000000009330768,
                    -0.00000000001595832,
                    0.00000000006708144,
                    0.000000000224682,
                    -0.00000000001344576,
                    -0.0000000002297496,
                    -0.0000000002707236,
                    -0.0000000002638404,
                    -0.0000000002391924,
                    -0.0000000000127086,
                    -0.00000000005480532,
                    -0.00000000006841308,
                    0.0000000003499068,
                    0.0000000004119936,
                    0.0000000003404088,
                    0.0000000003905088,
                    0.0000000002404668,
                    0.0000000001624428,
                    0.0000000001989324,
                    0.00000000001653156,
                    -0.0000000001695216,
                    -0.0000000002954652,
                    -0.0000000005030592,
                    -0.0000000007202208,
                    -0.0000000004720836,
                    -0.0000000002358312,
                    -0.000000000259764,
                    -0.00000000008699868,
                    0.00000000004142652,
                    -0.00000000003087624,
                    0.0000000000811938,
                    0.000000000186318,
                    0.0000000002721228,
                    0.0000000002204424,
                    0.0000000001397472,
                    0.0000000002218224,
                    0.000000000316344,
                    0.0000000002572572,
                    0.000000000161094,
                    -0.0000000001314312,
                    -0.0000000001578024,
                    0.00000000003590244,
                    0.00000000009048528,
                    -0.0000000000587646,
                    -0.000000000233406,
                    -0.0000000003636504,
                    -0.0000000001221552,
                    0.0000000003252288,
                    0.0000000002727048,
                    0.00000000008056392,
                    0.00000000003032976,
                    -0.0000000002368224,
                    -0.00000000006868728,
                    0.000000000201732,
                    -0.00000000015189,
                    -0.000000000268296,
                    -0.0000000000558468,
                    0.00000000004787244,
                    0.0000000001453284,
                    0.0000000001047036,
                    -0.0000000002413332,
                    -0.00000000007065948,
                    0.000000000335964,
                    0.0000000003868956,
                    0.000000000258018,
                    -0.000000000010606344,
                    -0.0000000003798312,
                    -0.0000000002211396,
                    -0.000000000095364,
                    -0.0000000002597748,
                    -0.000000000356466,
                    -0.0000000005139984,
                    -0.0000000003653904,
                    0.00000000008361324,
                    0.000000000191526,
                    0.0000000002282532,
                    0.00000000036888,
                    0.0000000003796416,
                    0.0000000004843884,
                    0.0000000004293912,
                    0.0000000001215168,
                    -0.00000000006604572,
                    0.00000000005064168,
                    -0.000000000003731916,
                    -0.00000000007788852,
                    -0.0000000001976184,
                    -0.0000000003371892,
                    -0.0000000002746704,
                    -0.0000000001220244,
                    -0.00000000011943,
                    -0.00000000007894968,
                    -0.00000000002563332,
                    -0.0000000001328076,
                    0.000000000003468216,
                    0.0000000001828608,
                    0.0000000001422324,
                    0.000000000217188,
                    0.0000000002760396,
                    0.0000000001632408,
                    0.000000000238896,
                    0.0000000003080724,
                    -0.000000000011512848,
                    -0.0000000003082644,
                    -0.0000000004012356,
                    -0.000000000223644,
                    0.00000000002091936,
                    -0.00000000002269836,
                    -0.000000000307566,
                    -0.0000000003006492,
                    -0.0000000002246712,
                    0.00000000008432424,
                    0.0000000002327232,
                    -0.00000000005251548,
                    -0.00000000006532812,
                    0.00000000001394916,
                    0.00000000003634956,
                    0.0000000001860192,
                    0.0000000001267296,
                    0.00000000003289392,
                    0.0000000001690044,
                    0.0000000001792152,
                    0.00000000004029708,
                    -0.00000000007505352,
                    -0.0000000001378692,
                    -0.0000000001498116,
                    -0.00000000002191944,
                    0.0000000001420332,
                    0.0000000001437384,
                    -0.00000000001966536,
                    -0.00000000006257376,
                    -0.00000000002225676,
                    0.0000000002057616,
                    0.0000000002416668,
                    0.000000000176508,
                    0.0000000001336944,
                    0.00000000009948228,
                    0.0000000001471512,
                    0.00000000003991644,
                    -0.0000000002582916,
                    -0.0000000002727984,
                    -0.0000000002249472,
                    -0.00000000006117552,
                    -0.00000000010570092,
                    -0.0000000003528564,
                    -0.0000000002747376,
                    -0.0000000002064624,
                    -0.0000000001201404,
                    -0.00000000006598608,
                    -0.0000000000934644,
                    0.00000000001279476,
                    0.0000000002143644,
                    0.0000000001707024,
                    0.000000000173706,
                    0.00000000011413932,
                    0.000000000205716,
                    0.0000000003475428,
                    0.000000000314466,
                    0.0000000001256628,
                    -0.000000000139392,
                    -0.0000000002650392,
                    -0.0000000001795116,
                    -0.00000000011803932,
                    -0.000000000131148,
                    -0.00000000010429092,
                    -0.000000000165408,
                    -0.0000000001881972,
                    -0.00000000000931842,
                    0.00000000008185404,
                    0.00000000005236428,
                    0.0000000001997808,
                    0.0000000002888208,
                    0.000000000270006,
                    0.0000000002862036,
                    0.0000000001813956,
                    0.00000000008934312,
                    0.00000000004524708,
                    0.00000000002870616,
                    -0.0000000002326884,
                    -0.000000000401394,
                    -0.0000000002116092,
                    -0.0000000002057496,
                    -0.0000000001695432,
                    -0.0000000001599048,
                    -0.0000000002272092,
                    0.00000000000220878,
                    0.0000000004852104,
                    0.0000000005867472,
                    0.0000000002449008,
                    0.00000000005177964,
                    0.0000000001243764,
                    0.00000000003027828,
                    0.0000000001224048,
                    0.00000000004984836,
                    -0.000000000397308,
                    -0.0000000005440644,
                    -0.0000000004160268,
                    -0.0000000004925064,
                    -0.0000000003830112,
                    -0.0000000001978284,
                    -0.0000000001980732,
                    -0.00000000009393168,
                    0.0000000002846736,
                    0.0000000003872772,
                    0.0000000002896668,
                    0.0000000004788948,
                    0.00000000051237,
                    0.0000000003588732,
                    0.0000000003040476,
                    0.00000000001774008,
                    -0.0000000002637456,
                    -0.000000000210708,
                    -0.0000000001806636,
                    -0.0000000001271508,
                    -0.00000000002568204,
                    -0.00000000007345764,
                    -0.000000000271632,
                    -0.0000000001593732,
                    -0.0000000000035571,
                    0.0000000001270788,
                    0.0000000003408192,
                    0.000000000270474,
                    0.00000000010594464,
                    0.0000000002203044,
                    0.000000000230472,
                    0.0000000001684524,
                    0.0000000000703668,
                    -0.00000000005765628,
                    -0.0000000001337436,
                    -0.0000000002306964,
                    -0.00000000026703,
                    -0.0000000002993916,
                    -0.0000000004160808,
                    -0.0000000004043844,
                    -0.000000000233832,
                    -0.0000000001563936,
                    -0.0000000001412532,
                    0.00000000004111476,
                    0.00000000008362104,
                    0.0000000002343504,
                    0.0000000003948288,
                    0.0000000001932156,
                    0.0000000001523916,
                    0.0000000003898632,
                    0.0000000001744944,
                    0.00000000006599556,
                    0.00000000009919488,
                    -0.0000000001490856,
                    -0.0000000002400924,
                    -0.0000000001617432,
                    -0.000000000190572,
                    -0.00000000006406188,
                    0.000000000002365836,
                    -0.0000000002427576,
                    -0.000000000147552,
                    0.00000000008005104,
                    0.0000000001264596,
                    0.0000000001704012,
                    0.00000000009121092,
                    0.00000000007139556,
                    0.0000000002319672,
                    0.0000000002424108,
                    0.00000000002090892,
                    -0.0000000000657372,
                    -0.00000000004750836,
                    -0.0000000000866826,
                    -0.00000000008266056,
                    -0.00000000006442368,
                    -0.00000000004740276,
                    -0.00000000005007672,
                    -0.00000000010252968,
                    0.000000000004402068,
                    0.00000000011758884,
                    0.00000000005967972,
                    0.000000000008507028,
                    0.00000000009879036,
                    0.000000000124722,
                    0.00000000011461788,
                    0.0000000001594368,
                    0.00000000001682964,
                    -0.0000000000987072,
                    0.00000000001918248,
                    -0.00000000003659004,
                    -0.00000000004654212,
                    -0.0000000001408512,
                    -0.0000000004109088,
                    -0.0000000004227024,
                    -0.00000000026748,
                    -0.0000000002632824,
                    -0.0000000001629048,
                    -0.0000000002149536,
                    -0.0000000001647876,
                    0.0000000001690884,
                    0.0000000003123204,
                    0.0000000003435792,
                    0.0000000003761316,
                    0.0000000003157836,
                    0.0000000003496308,
                    0.000000000417504,
                    0.0000000003168288,
                    0.0000000001517484,
                    0.000000000002292072,
                    -0.00000000008557128,
                    -0.00000000011912808,
                    -0.00000000005656296,
                    -0.0000000001925772,
                    -0.0000000003833856,
                    -0.0000000003458832,
                    -0.0000000002435568,
                    -0.00000000003259908,
                    -0.0000000001212048,
                    -0.0000000002678232,
                    -0.00000000009188388,
                    0.00000000000817182,
                    0.0000000001789032,
                    0.000000000306648,
                    0.0000000001755216,
                    0.00000000006758856,
                    0.00000000017481,
                    0.0000000002378064,
                    0.0000000002123652,
                    0.00000000001923732,
                    -0.00000000001298148,
                    -0.00000000002667432,
                    0.000000000003933924,
                    -0.000000000005789556,
                    -0.000000000138048,
                    -0.0000000003393432,
                    -0.000000000298734,
                    -0.00000000011366556,
                    0.000000000016632,
                    0.0000000000244902,
                    -0.00000000010603452,
                    -0.000000000186312,
                    -0.00000000010015788,
                    0.00000000002964708,
                    0.0000000001860108,
                    0.0000000002339208,
                    0.0000000001143036,
                    0.0000000001533276,
                    0.0000000001462356,
                    0.000000000181884,
                    0.00000000010933416,
                    -0.00000000013389,
                    -0.0000000001850076,
                    -0.0000000001203936,
                    -0.0000000001439436,
                    -0.000000000158184,
                    -0.0000000001763448,
                    -0.0000000001308072,
                    -0.00000000008034996,
                    0.00000000001314204,
                    0.0000000001739076,
                    0.00000000024744,
                    0.0000000003061728,
                    0.0000000002497464,
                    0.0000000001248108,
                    0.00000000004005012,
                    0.000000000011188932,
                    0.0000000001693008,
                    0.0000000001208832,
                    -0.0000000001622976,
                    -0.0000000001976184,
                    -0.00000000011673852,
                    0.00000000001489188,
                    0.0000000000957294,
                    -0.00000000009933348,
                    -0.0000000003058836,
                    -0.0000000002476128,
                    0.00000000004326132,
                    0.000000000165006,
                    0.00000000006928212,
                    -0.0000000001683588,
                    -0.0000000003036684,
                    -0.0000000001628952,
                    0.0000000001387824,
                    0.0000000000520404,
                    -0.0000000002007612,
                    -0.0000000003271332,
                    -0.0000000001366284,
                    0.0000000002350584,
                    0.0000000005280552,
                    0.0000000003631992,
                    -0.00000000011831892,
                    -0.0000000001245048,
                    0.0000000001454088,
                    0.0000000003115044,
                    0.0000000003763308,
                    0.0000000002471304,
                    -0.0000000000997368,
                    -0.0000000002512164,
                    -0.0000000002421672,
                    -0.0000000002364132,
                    -0.00000000005448612,
                    0.00000000022461,
                    -0.00000000000483372,
                    -0.0000000003222144,
                    -0.000000000232386,
                    -0.0000000001589436,
                    0.00000000006147108,
                    0.0000000003254832,
                    0.0000000000828102,
                    -0.0000000002450064,
                    -0.0000000001410816,
                    -0.0000000000624732,
                    -0.00000000002443728,
                    0.0000000002438892,
                    0.0000000003071076,
                    0.00000000007546068,
                    0.0000000001594392,
                    0.0000000001804728,
                    0.0000000002016948,
                    0.0000000003305592,
                    0.0000000001659204,
                    -0.0000000002948676,
                    -0.0000000005801604,
                    -0.000000000680334,
                    -0.0000000005373048,
                    -0.0000000003151524,
                    0.00000000003897648,
                    0.0000000004430916,
                    0.0000000005025816,
                    0.0000000001623336,
                    -0.0000000001341924,
                    -0.0000000003453036,
                    -0.000000000152358,
                    0.0000000002942064,
                    0.0000000004121352,
                    0.0000000002424432,
                    0.00000000005042568,
                    -0.0000000001582776,
                    -0.00000000009546936,
                    0.0000000001655724,
                    0.00000000004157388,
                    0.000000000009391296,
                    -0.00000000002542596,
                    -0.0000000002834484,
                    -0.00000000011437848,
                    0.0000000002053644,
                    0.0000000001331604,
                    0.0000000001826832,
                    0.0000000002205444,
                    0.00000000002228964,
                    -4.994436E-13,
                    -0.00000000005747052,
                    -0.0000000002552496,
                    -0.0000000001881024,
                    0.00000000002449044,
                    0.000000000017322,
                    -0.000000000159762,
                    -0.0000000002729412,
                    -0.0000000003794892,
                    -0.0000000001768788,
                    0.00000000009524724,
                    0.00000000002793876,
                    -0.00000000008071308,
                    0.00000000004547388,
                    0.0000000001387824,
                    0.0000000003250884,
                    0.0000000002553924,
                    0.00000000003114156,
                    0.000000000001981284,
                    0.00000000002827692,
                    0.0000000001515048,
                    0.0000000002981412,
                    0.00000000006739344,
                    -0.0000000001878576,
                    -0.0000000002501112,
                    -0.0000000002207244,
                    -0.00000000004182108,
                    0.000000000011590476,
                    -0.00000000001988268,
                    0.0000000001106334,
                    0.0000000002867388,
                    0.0000000002245224,
                    0.00000000006587604,
                    -0.00000000007382232,
                    -0.0000000001231596,
                    -0.000000000003653616,
                    0.000000000016932,
                    -0.000000000241062,
                    -0.00000000015543,
                    -0.00000000004928472,
                    -0.00000000006557592,
                    -0.00000000002775984,
                    -0.0000000001242384,
                    -0.00000000011724984,
                    0.00000000006264228,
                    0.0000000002175936,
                    0.0000000002031288,
                    0.00000000003509652,
                    -0.00000000008028576,
                    -9.746952E-13,
                    0.0000000001440792,
                    0.00000000009897828,
                    0.00000000005619228,
                    -0.00000000003863088,
                    -0.00000000011894544,
                    -0.0000000000283632,
                    -0.00000000011328168,
                    -0.0000000002201412,
                    -0.0000000001788024,
                    -0.0000000001204092,
                    -0.0000000000032382,
                    -0.00000000004274232,
                    -0.000000000129486,
                    -0.00000000009311736,
                    -0.00000000006852312,
                    0.00000000011181948,
                    0.000000000350916,
                    0.000000000298716,
                    0.000000000185316,
                    0.0000000001280256,
                    0.0000000002080692,
                    0.0000000002855688,
                    0.00000000011630424,
                    0.00000000005425368,
                    0.00000000003959004,
                    -0.00000000002603976,
                    -0.00000000011741892,
                    -0.0000000002911896,
                    -0.0000000003209676,
                    -0.0000000002009904,
                    -0.0000000001869744,
                    -0.0000000001911312,
                    -0.0000000001259928,
                    0.00000000007528704,
                    0.0000000001245792,
                    0.0000000000842148,
                    0.000000000230304,
                    0.000000000245808,
                    0.0000000002523348,
                    0.00000000010809816,
                    -0.0000000000237876,
                    -0.0000000000418566,
                    -0.00000000009182832,
                    -0.000000000154548,
                    -0.0000000002547888,
                    -0.0000000003038232,
                    -0.0000000001857024,
                    -0.0000000002411496,
                    -0.0000000003074808,
                    -0.0000000002027808,
                    0.00000000001241448,
                    0.0000000001346952,
                    0.000000000217404,
                    0.0000000002349576,
                    0.0000000002521428,
                    0.0000000003007152,
                    0.0000000003305184,
                    0.0000000002283588,
                    0.0000000001165116,
                    0.00000000002161344,
                    0.000000000010428468,
                    -0.000000000008144016,
                    -0.0000000001464948,
                    -0.00000000025083,
                    -0.0000000001844316,
                    -0.0000000001239576,
                    -0.00000000003553608,
                    0.00000000003932112,
                    0.0000000001575876,
                    0.0000000001933764,
                    0.00000000002051028,
                    -0.0000000001208208,
                    -0.00000000010657788,
                    0.00000000010669272,
                    0.0000000002161452,
                    0.00000000006038532,
                    -0.00000000011541888,
                    -0.00000000009550584,
                    -0.00000000011567496,
                    -0.00000000008724144,
                    -0.00000000003915612,
                    -0.00000000004403724,
                    -0.0000000000901278,
                    -0.00000000008566248,
                    -0.00000000011790252,
                    -0.00000000011190156,
                    0.00000000002106912,
                    0.0000000001373664,
                    0.00000000004039248,
                    0.00000000005062368,
                    0.0000000001588548,
                    0.00000000009411672,
                    -6.938544E-13,
                    0.00000000004355568,
                    -0.00000000008190444,
                    -0.0000000001507416,
                    -0.00000000009215808,
                    -0.00000000018558,
                    -0.0000000002179536,
                    0.0000000000319152,
                    0.00000000002899068,
                    -0.00000000006002616,
                    0.0000000001315356,
                    0.0000000001220964,
                    0.0000000001215828,
                    0.0000000003160236,
                    0.0000000001627836,
                    -0.00000000001990704,
                    0.0000000002423508,
                    0.0000000002579796,
                    0.0000000001069242,
                    0.00000000006765192,
                    -0.00000000010320984,
                    -0.0000000002202204,
                    -0.00000000003039576,
                    -0.000000000009016824,
                    -0.00000000011397732,
                    -0.000000000194532,
                    -0.0000000002388156,
                    -0.00000000016356,
                    -0.000000000095988,
                    -0.00000000003286416,
                    0.00000000001788252,
                    -0.0000000001218468,
                    0.00000000001596552,
                    0.000000000312342,
                    0.000000000224178,
                    0.0000000001938732,
                    0.0000000000579576,
                    -0.0000000003247224,
                    -0.000000000249042,
                    0.00000000001215636,
                    -0.00000000003003996,
                    -0.0000000000558684,
                    -0.00000000007463916,
                    -0.0000000001527636,
                    -0.0000000000945258,
                    0.0000000001544352,
                    0.0000000001713132,
                    0.00000000002688576,
                    0.000000000078102,
                    -0.00000000010356732,
                    -0.00000000004457364,
                    0.0000000001601784,
                    0.00000000003536724,
                    0.0000000001460448,
                    0.0000000002025,
                    0.00000000005242608,
                    0.00000000010290552,
                    0.00000000003025668,
                    -0.0000000002371452,
                    -0.0000000001921056,
                    0.00000000006454308,
                    0.0000000001075518,
                    0.00000000008395128,
                    0.0000000000427782,
                    -0.0000000001666776,
                    -0.00000000009681348,
                    0.00000000008176584,
                    0.00000000009285132,
                    -0.00000000002010972,
                    -0.0000000001473156,
                    -0.0000000001444284,
                    0.000000000002323956,
                    -0.0000000000266118,
                    0.0000000000506082,
                    0.0000000002018268,
                    0.0000000001444104,
                    0.000000000128214,
                    -0.00000000000924114,
                    -0.0000000002509404,
                    -0.0000000002083332,
                    1.343472E-13,
                    -0.00000000006385104,
                    0.000000000001762728,
                    -0.00000000007050828,
                    -0.0000000002206296,
                    -0.00000000010553988,
                    0.00000000004084176,
                    0.0000000000507756,
                    0.00000000009946836,
                    -0.00000000001711188,
                    0.00000000008751468,
                    0.0000000002398476,
                    0.0000000001679688,
                    0.0000000000203454,
                    -0.0000000001419444,
                    -0.00000000007970736,
                    0.0000000002029356,
                    0.0000000001676976,
                    -0.00000000003609564,
                    -0.0000000003017268,
                    -0.0000000002546424,
                    0.000000000131532,
                    0.0000000002189904,
                    0.00000000007275492,
                    -0.00000000010205616,
                    -0.00000000003932664,
                    0.0000000001863048,
                    0.0000000001843908,
                    -0.00000000004981356,
                    -0.0000000002424096,
                    -0.0000000001207992,
                    0.000000000099156,
                    0.00000000001364052,
                    -0.00000000004558476,
                    -0.0000000000594354,
                    0.000000000011813364,
                    0.0000000001335036,
                    0.0000000000965184,
                    -0.00000000003778956,
                    -0.0000000001201968,
                    -0.00000000004908072,
                    0.00000000010956864,
                    -0.00000000001590048,
                    -0.00000000016944,
                    -0.0000000002415444,
                    -0.0000000001380696,
                    0.00000000003633432,
                    0.00000000011383872,
                    0.0000000001203276,
                    0.000000000072846,
                    0.0000000000474042,
                    0.0000000000693756,
                    0.000000000122676,
                    0.0000000000608214,
                    -0.00000000006362604,
                    -0.00000000002550576,
                    -0.00000000004623384,
                    -0.0000000000308142,
                    -3.023712E-13,
                    0.000000000002381976,
                    -0.00000000007087092,
                    0.000000000002795064,
                    0.00000000009470292,
                    0.000000000005160996,
                    -0.00000000009152952,
                    -0.00000000005620896,
                    0.0000000001343088,
                    0.00000000006988104,
                    -0.00000000004167732,
                    -0.0000000001079292,
                    -0.0000000001255068,
                    -0.000000000079578,
                    0.00000000001675884,
                    -0.0000000000310704,
                    0.00000000001204284,
                    0.00000000007050264,
                    0.00000000007337004,
                    0.000000000009562284,
                    0.00000000011195796,
                    0.0000000001255728,
                    0.0000000000451488,
                    0.000000000010393992,
                    0.00000000005927832,
                    0.00000000010457232,
                    0.00000000006251148,
                    -0.00000000001388304,
                    -0.0000000001306776,
                    -0.00000000011702436,
                    -0.00000000003662316,
                    -0.0000000000363048,
                    -0.0000000000564702,
                    0.000000000003793872,
                    -0.000000000001089036,
                    -0.00000000005375292,
                    -0.00000000001702932,
                    0.00000000002494824,
                    -0.00000000008743032,
                    -0.0000000001393704,
                    -0.00000000004800372,
                    0.000000000125916,
                    0.0000000000497712,
                    -0.0000000002113308,
                    -0.0000000002371956,
                    -0.0000000001184772,
                    0.0000000000313998,
                    0.000000000006982656,
                    -0.0000000000381114,
                    0.00000000003407868,
                    0.0000000001398648,
                    0.0000000003170652,
                    0.00000000041994,
                    0.0000000001580364,
                    -0.00000000008935188,
                    0.00000000010625292,
                    0.000000000202632,
                    0.000000000204114,
                    0.0000000001985976,
                    -0.0000000002136756,
                    -0.000000000318624,
                    0.0000000002284104,
                    0.00000000009697656,
                    -0.0000000003359592,
                    -0.0000000001374348,
                    -0.0000000002309544,
                    -0.0000000001718616,
                    0.0000000001668804,
                    -0.0000000004756212,
                    -0.000000000580674,
                    0.00000000005114412,
                    0.00000000011572596,
                    0.0000000002217372,
                    0.0000000002281296,
                    -0.0000000000416472,
                    -0.0000000002480412,
                    0.0000000001532016,
                    0.000000000432306,
                    0.0000000001452504,
                    -0.0000000001272048,
                    -0.00000000009083484,
                    0.00000000010566096,
                    0.0000000003487944,
                    0.000000000004852188,
                    -0.0000000003791352,
                    -0.0000000003028044,
                    0.000000000234858,
                    0.0000000004633236,
                    -0.00000000008411448,
                    -0.0000000003313032,
                    -0.00000000005513688,
                    0.00000000006915888,
                    0.00000000034896,
                    0.000000000242994,
                    -0.00000000034761,
                    -0.000000000139152,
                    0.0000000004300212,
                    0.00000000010726968,
                    -0.000000000188082,
                    -0.00000000009776124,
                    -0.0000000004518,
                    -0.0000000002402892,
                    0.0000000002617356,
                    -0.0000000001378056,
                    -0.0000000003468204,
                    0.00000000010542048,
                    0.00000000004048632,
                    0.0000000002333472,
                    0.00000000040479,
                    -0.00000000002215512,
                    -0.0000000002457036,
                    -0.00000000005492184,
                    -0.0000000001623204,
                    0.000000000180984,
                    0.000000000460092,
                    -0.00000000002586516,
                    -0.0000000001711776,
                    0.0000000000419358,
                    -0.0000000000924792,
                    0.0000000001596804,
                    -0.00000000010358856,
                    -0.0000000002976672,
                    0.00000000009899016,
                    -0.0000000001233876,
                    -0.0000000001757964,
                    0.000000000006161268,
                    0.00000000001207884,
                    0.0000000003190896,
                    0.00000000004398792,
                    -0.000000000179664,
                    0.00000000005327268,
                    -0.00000000004017264,
                    0.00000000011200236,
                    0.0000000001550364,
                    -0.0000000001010892,
                    0.0000000000069891,
                    0.0000000003001452,
                    0.0000000000827286,
                    -0.0000000002450592,
                    0.00000000001927812,
                    0.0000000001580424,
                    -0.0000000002541852,
                    -0.00000000004779228,
                    -0.0000000001717764,
                    -0.0000000001383348,
                    -0.00000000010770312,
                    0.0000000001209264,
                    -0.00000000006077856,
                    -0.00000000001698216,
                    0.0000000002363496,
                    0.0000000002402148,
                    -0.00000000009950592,
                    -0.00000000002863356,
                    0.0000000001454844,
                    0.00000000004262268,
                    0.00000000002279712,
                    -0.000000000122658,
                    -0.00000000010591032,
                    0.00000000002880084,
                    0.00000000003197796,
                    0.00000000001850904,
                    0.00000000004452456,
                    -0.0000000001266,
                    -0.00000000007700052,
                    -0.00000000006807936,
                    0.000000000054081,
                    -0.00000000003839448,
                    0.00000000011712564,
                    -0.00000000009443196,
                    -0.000000000155994,
                    0.00000000004931064,
                    0.0000000001597368,
                    0.00000000001973208,
                    -0.00000000010154424,
                    -0.000000000006737016,
                    0.00000000011133756,
                    -0.00000000006418896,
                    -0.00000000011316168,
                    -0.000000000279384,
                    -0.0000000001640748,
                    0.0000000005902224,
                    0.0000000004394496,
                    0.00000000003272064,
                    -0.00000000001755324,
                    -0.00000000003480048,
                    -0.00000000007547856,
                    0.000000000009853884,
                    0.00000000001991856,
                    -0.0000000000698916,
                    -0.0000000000637974,
                    -0.00000000002054748,
                    -0.000000000008066532,
                    -0.0000000000469626,
                    -0.00000000002408508,
                    -0.00000000005966064,
                    -0.0000000000312372,
                    -0.00000000001741488,
                    -0.00000000003491508,
                    -0.000000000070779,
                    -0.00000000003871104,
                    0.000000000006870144,
                    0.00000000003713352,
                    0.00000000002728044,
                    -0.00000000004486668,
                    -0.00000000005127288,
                    0.000000000005257524,
                    0.00000000005924268,
                    0.00000000005691432,
                    0.0000000000458046,
                    0.00000000001459272,
                    -0.00000000004473864,
                    0.000000000011051028,
                    0.000000000043014,
                    0.0000000000272862,
                    0.00000000004523208,
                    0.00000000005365968,
                    0.00000000001883772,
                    0.00000000003167412,
                    1.1641824E-12,
                    -0.00000000002961,
                    0.000000000002228508,
                    0.0000000000473706,
                    -5.574684E-13,
                    -0.000000000059508,
                    -0.00000000005099664,
                    -0.00000000005446356,
                    -0.00000000001104,
                    0.00000000001574592,
                    1.0364112E-12,
                    -0.00000000009795492,
                    -0.00000000008664132,
                    -0.00000000002676888,
                    0.000000000002405148,
                    0.00000000003178824,
                    0.00000000003966852,
                    0.00000000006915588,
                    0.00000000008101992,
                    0.00000000005828568,
                    -0.0000000000143328,
                    -0.00000000003043368,
                    -0.00000000002809368,
                    9.141384E-13,
                    0.000000000004971384,
                    0.00000000003531576,
                    0.00000000002189808,
                    -0.0000000000324666,
                    -0.0000000000448074,
                    -0.00000000004470972,
                    0.00000000001373544,
                    0.00000000002740392,
                    0.0000000000225084,
                    0.000000000001502244,
                    -0.00000000001566792,
                    0.000000000001915032,
                    -0.0000000000029931,
                    -0.00000000000850872,
                    -0.000000000003362112,
                    0.0000000000463374,
                    0.00000000006622452,
                    0.00000000001449528,
                    -0.00000000005320428,
                    -0.00000000006704856,
                    -0.0000000000521328,
                    -0.0000000000343032,
                    -0.000000000006591756,
                    0.0000000000195762,
                    0.00000000002587728,
                    0.0000000000296526,
                    0.000000000003571008,
                    -0.00000000003093912,
                    -0.00000000001717764,
                    0.00000000002636868,
                    0.00000000003696744,
                    0.000000000013785,
                    0.00000000004601172,
                    0.00000000002930712,
                    -0.00000000000997794,
                    -0.00000000004948128,
                    -0.00000000008078088,
                    -0.0000000000136428,
                    0.00000000006503076,
                    0.00000000004330236,
                    -0.00000000002058828,
                    -0.00000000002639832,
                    -0.000000000006211212,
                    0.000000000004783116,
                    0.00000000001534308,
                    -0.00000000002144628,
                    -0.00000000001712676,
                    0.00000000001365156,
                    0.000000000008490612,
                    0.00000000005239536,
                    0.00000000004206576,
                    -0.000000000000997644,
                    -0.00000000003130956,
                    -0.00000000001408284,
                    -0.000000000006900336,
                    0.000000000003597336,
                    -0.00000000002067612,
                    -0.00000000001585476,
                    -0.000000000005210316,
                    0.00000000002373612,
                    0.00000000005703012,
                    0.0000000000330588,
                    -0.00000000003837144,
                    -0.00000000005735676,
                    -0.00000000003781872,
                    -0.000000000009236532,
                    -0.00000000002132208,
                    -0.0000000000352932,
                    0.000000000003651816,
                    0.00000000003906,
                    0.000000000009386796,
                    -0.00000000004014,
                    -0.000000000011900328,
                    0.0000000000364068,
                    0.00000000006062952,
                    0.0000000000198852,
                    0.00000000001704552,
                    0.0000000000305064,
                    -0.000000000001725648,
                    -0.00000000002213736,
                    -0.00000000005193492,
                    -0.00000000002489904,
                    0.00000000003437424,
                    0.0000000000394194,
                    -0.0000000000297408,
                    -0.00000000005736576,
                    -0.0000000000321834,
                    0.00000000006010536,
                    0.00000000008509656,
                    -0.000000000010956588,
                    -0.0000000000649722,
                    -0.00000000005881596,
                    -0.000000000009524232,
                    0.00000000006460428,
                    0.00000000006523152,
                    -0.000000000001393752,
                    -0.00000000002747364,
                    -0.00000000000907794,
                    0.00000000000232248,
                    0.000000000001214232,
                    0.000000000005506164,
                    -0.00000000004188612,
                    -0.00000000002131992,
                    0.00000000003781512,
                    0.0000000000736044,
                    0.000000000051009,
                    -0.00000000003763248,
                    -0.0000000000343944,
                    0.000000000010023036,
                    0.00000000002284224,
                    -0.000000000003340308,
                    -0.00000000005295588,
                    -0.0000000000600066,
                    -0.00000000001323912,
                    0.00000000000376566,
                    -0.00000000001813416,
                    0.00000000002508624,
                    0.00000000005259252,
                    0.00000000003831924,
                    -0.00000000004485336,
                    -0.0000000000871956,
                    -0.00000000003593064,
                    0.00000000002727504,
                    0.0000000000321384,
                    0.000000000009211644,
                    -0.00000000001086918,
                    -0.00000000003698532,
                    0.00000000000760194,
                    0.00000000003314352,
                    0.000000000002247552,
                    0.00000000003459168,
                    0.00000000001470552,
                    -0.00000000005531892,
                    -0.00000000004723716,
                    -0.000000000007029552,
                    0.00000000006188316,
                    0.00000000010686156,
                    0.00000000005559588,
                    0.000000000007154076,
                    -0.00000000003252876,
                    -0.000000000009907932,
                    0.00000000001286832,
                    0.0000000000634926,
                    0.00000000000889098,
                    -0.00000000001390908,
                    -0.000000000007439184,
                    -0.00000000004376688,
                    -0.00000000004982892,
                    -0.00000000004644792,
                    -0.00000000005426484,
                    -0.00000000006148884,
                    0.00000000000837132,
                    0.00000000006514332,
                    0.00000000005281248,
                    -0.00000000003892068,
                    -0.000000000052059,
                    -0.00000000000953154,
                    0.00000000004607436,
                    0.00000000006847548,
                    0.00000000001970796,
                    -0.000000000018783,
                    0.000000000008905116,
                    0.000000000001667772,
                    -0.00000000002389596,
                    -0.00000000003319512,
                    -0.000000000001803672,
                    0.0000000000348396,
                    0.00000000005873004,
                    -5.937972E-13,
                    -0.00000000005669364,
                    -0.00000000005829396,
                    -0.00000000004061388,
                    -0.0000000000030699,
                    0.00000000001979112,
                    0.0000000000093168,
                    -0.00000000002505984,
                    -0.00000000001981596,
                    0.00000000001745532,
                    0.00000000001294788,
                    -0.000000000007380888,
                    0.000000000006805068,
                    0.000000000002341812,
                    0.00000000003382884,
                    0.00000000005962452,
                    0.00000000002093448,
                    0.00000000000272076,
                    0.00000000004837044,
                    0.0000000000349746,
                    -0.00000000002296956,
                    -0.0000000000825126,
                    -0.0000000000719694,
                    0.0000000000216204,
                    0.0000000000948576,
                    0.00000000005295408,
                    -0.00000000003878088,
                    -0.00000000001996932,
                    0.00000000004652268,
                    0.00000000003977976,
                    -0.00000000002312472,
                    -0.00000000006053316,
                    -0.00000000004298688,
                    0.00000000001486812,
                    -0.000000000004692768,
                    -0.0000000000554706,
                    -0.00000000004900464,
                    0.00000000001487436,
                    0.00000000003127224,
                    0.00000000000838578,
                    -0.000000000010524996,
                    -0.0000000000320292,
                    -0.00000000004616124,
                    -0.00000000002256108,
                    -0.000000000005379684,
                    0.000000000012897,
                    0.000000000010452156,
                    -0.00000000000423174,
                    0.00000000000517968,
                    -0.00000000001234164,
                    0.00000000003614496,
                    0.0000000000468222,
                    0.00000000001236864,
                    0.000000000004334544,
                    0.000000000010574088,
                    0.0000000000169458,
                    0.00000000000207198,
                    0.0000000000146508,
                    0.00000000003387,
                    0.00000000006600888,
                    0.00000000001403856,
                    -0.0000000000545352,
                    -0.0000000000422058,
                    -0.0000000000220902,
                    -0.00000000001201308,
                    -0.00000000001797972,
                    -0.00000000007970844,
                    -0.0000000000217608,
                    0.0000000000810096,
                    0.00000000011834208,
                    0.0000000000587652,
                    -0.00000000003575292,
                    -0.00000000008783808,
                    -0.00000000002587356,
                    0.0000000000510606,
                    0.00000000005113104,
                    0.00000000003377844,
                    -0.00000000004052088,
                    -0.000000000045657,
                    -0.00000000007317384,
                    -0.00000000003353532,
                    0.0000000000315282,
                    0.000000000036114,
                    -0.00000000001653648,
                    -0.000000000047946,
                    -0.00000000007271592,
                    -0.0000000000488388,
                    -0.000000000002993508,
                    0.00000000003707808,
                    0.00000000007677252,
                    0.00000000008147904,
                    0.00000000002399952,
                    -0.000000000010328244,
                    -0.000000000008498112,
                    -0.00000000002469348,
                    -0.00000000004193316,
                    -0.00000000002233752,
                    0.00000000003607908,
                    -0.0000000000025119,
                    -0.0000000000120942,
                    -0.00000000001381752,
                    -0.0000000000206334,
                    0.0000000000256656,
                    0.0000000000336978,
                    0.00000000002371056,
                    0.000000000004824036,
                    0.00000000004122396,
                    0.00000000002434152,
                    -0.000000000001740648,
                    -0.00000000004325172,
                    -0.0000000000889482,
                    0.000000000004116504,
                    0.00000000011483124,
                    0.00000000008901468,
                    -0.000000000002106144,
                    -0.00000000005978532,
                    -0.0000000000770778,
                    -0.00000000001717884,
                    0.00000000003823164,
                    0.00000000001906116,
                    0.00000000003725616,
                    0.00000000003146928,
                    -0.00000000001842576,
                    -0.00000000009502524,
                    -0.00000000011384484,
                    -0.00000000005624124,
                    0.00000000002606292,
                    0.00000000005602212,
                    0.00000000003663804,
                    -0.00000000002942772,
                    -0.0000000000368226,
                    -0.000000000007134828,
                    0.0000000000215268,
                    0.0000000000289398,
                    0.00000000006639624,
                    0.00000000008478384,
                    0.00000000001296936,
                    -0.00000000002329236,
                    -0.00000000005634252,
                    -0.00000000003979704,
                    0.00000000002696148,
                    0.00000000005566896,
                    0.00000000004222752,
                    -0.00000000000442998,
                    -0.00000000006210288,
                    -0.0000000000659892,
                    -0.00000000001727292,
                    0.00000000002264652,
                    0.000000000010878852,
                    -0.000000000005512476,
                    1.0807068E-12,
                    -0.00000000002407872,
                    -0.00000000000429456,
                    0.00000000001910292,
                    0.000000000003978696,
                    0.00000000001470696,
                    0.0000000000223104,
                    -0.000000000006462828,
                    0.000000000001374216,
                    -0.000000000011436792,
                    0.00000000001973148,
                    0.00000000002403036,
                    -0.00000000001452792,
                    -0.00000000003245664,
                    -0.00000000002460744,
                    0.000000000010578804,
                    0.00000000003974112,
                    0.00000000004519368,
                    0.0000000000493662,
                    0.00000000002174016,
                    -0.00000000004336968,
                    -0.00000000006479124,
                    -0.00000000004177284,
                    0.00000000003890112,
                    -0.00000000001216656,
                    -0.00000000008134524,
                    -0.00000000004383264,
                    0.000000000010958412,
                    0.00000000006771552,
                    0.00000000007757184,
                    0.00000000002703528,
                    -0.00000000003903108,
                    -0.00000000003744996,
                    0.00000000001914852,
                    0.0000000000265578,
                    -0.00000000002622216,
                    -0.00000000005291808,
                    -0.00000000007367064,
                    0.0000000000233436,
                    0.00000000004448184,
                    0.00000000002330004,
                    0.00000000003991524,
                    0.00000000003513792,
                    -4.532124E-13,
                    0.000000000001876992,
                    0.00000000003003456,
                    0.00000000002238948,
                    -0.00000000000755844,
                    -0.00000000003174996,
                    -0.00000000003255168,
                    -0.0000000000423342,
                    -0.00000000002253132,
                    -0.00000000004337556,
                    -0.00000000003991188,
                    0.0000000000185028,
                    0.00000000005670432,
                    0.00000000003823092,
                    -0.00000000002901528,
                    -0.000000000003635844,
                    0.000000000010372116,
                    -0.00000000002821212,
                    -0.00000000002141844,
                    -0.000000000004864428,
                    0.00000000002929296,
                    0.00000000001958508,
                    -0.000000000006587628,
                    0.0000000000229296,
                    0.00000000002339064,
                    0.00000000007973808,
                    0.00000000005158212,
                    -0.00000000003187452,
                    -0.00000000004546332,
                    -0.000000000011173548,
                    0.000000000005123484,
                    0.000000000006621012,
                    -0.0000000000292362,
                    -0.00000000002918088,
                    -0.00000000001203756,
                    -0.0000000000361284,
                    0.0000000000030696,
                    -0.00000000001286508,
                    0.000000000004785384,
                    0.00000000001863456,
                    0.0000000000247992,
                    0.0000000000490602,
                    -0.00000000001635552,
                    -0.00000000001829892,
                    -0.00000000001717788,
                    -0.00000000003008784,
                    0.00000000003663324,
                    0.00000000004569672,
                    -0.0000000000164172,
                    -0.00000000002992104,
                    -0.00000000001518156,
                    0.000000000001509804,
                    -0.000000000005567028,
                    -0.00000000005347152,
                    -0.00000000005593872,
                    0.00000000001992984,
                    0.00000000005044488,
                    0.00000000004222044,
                    0.00000000001832364,
                    -0.000000000011192964,
                    -0.00000000002840724,
                    -0.000000000005046552,
                    0.00000000002747016,
                    0.00000000001878948,
                    0.00000000002019672,
                    -0.00000000001210356,
                    -0.00000000003785676,
                    -0.00000000002292468,
                    -0.0000000000341652,
                    0.000000000006259344,
                    0.00000000002285916,
                    0.00000000004533324,
                    0.00000000004686468,
                    0.00000000004920564,
                    0.00000000002014452,
                    -0.00000000001429848,
                    0.00000000000319752,
                    0.0000000000273048,
                    0.00000000002334936,
                    -0.000000000001639692,
                    -0.00000000003811044,
                    -0.0000000000778524,
                    -0.00000000003865452,
                    -0.00000000002441388,
                    -0.00000000001423428,
                    0.000000000004750524,
                    0.00000000002086068,
                    -0.00000000003296328,
                    -0.00000000005397096,
                    -0.00000000002245752,
                    0.00000000003771444,
                    0.00000000005251848,
                    0.00000000002075016,
                    -0.00000000001418652,
                    0.0000000000135594,
                    -0.000000000002554632,
                    -0.00000000002898456,
                    -0.00000000002457768,
                    -0.00000000003695796,
                    -0.00000000000151602,
                    0.0000000000302304,
                    0.00000000003483348,
                    0.000000000004951056,
                    4.05216E-14,
                    0.00000000002225664,
                    0.0000000000818226,
                    0.00000000001357452,
                    0.000000000011816328,
                    0.00000000005513388,
                    0.00000000001592256,
                    -0.00000000002080452,
                    -0.00000000007419888,
                    -0.00000000005910252,
                    -0.000000000009911172,
                    0.00000000005576508,
                    0.00000000004284576,
                    -0.0000000000249486,
                    -0.00000000002510856,
                    -0.00000000002448228,
                    -0.00000000003340716,
                    -0.000000000004075416,
                    0.000000000008593224,
                    0.00000000001840812,
                    -0.000000000006337464,
                    -0.00000000003140352,
                    -0.0000000000559662,
                    -0.0000000000515658,
                    0.00000000001673904,
                    0.00000000001505208,
                    0.00000000003079956,
                    0.00000000004553916,
                    0.000000000008384472,
                    -0.00000000001361604,
                    -0.00000000003047256,
                    -0.00000000005002656,
                    0.00000000002443524,
                    0.00000000004850436,
                    0.000000000026874,
                    0.00000000006340704,
                    0.00000000003920256,
                    0.000000000005660532,
                    -0.00000000002015256,
                    0.000000000009888084,
                    0.00000000001493868,
                    -0.00000000003693672,
                    -0.00000000002632752,
                    -0.00000000004495368,
                    -0.00000000003393048,
                    -0.000000000003294708,
                    0.00000000001670352,
                    0.00000000007718016,
                    0.0000000000457794,
                    0.000000000009239808,
                    0.00000000000256722,
                    -0.00000000002548584,
                    -0.00000000003405648,
                    -0.0000000000154992,
                    0.00000000001201272,
                    0.000000000002872752,
                    -0.00000000004404264,
                    -0.0000000000641904,
                    -0.00000000005485296,
                    -0.00000000003336648,
                    0.00000000001333452,
                    0.00000000004662108,
                    0.000000000002144064,
                    -0.00000000002486724,
                    -0.00000000002972508,
                    0.00000000000489906,
                    0.00000000007367736,
                    0.0000000000603438,
                    0.00000000001367052,
                    -0.0000000000283572,
                    -0.00000000001489116,
                    0.000000000006185988,
                    0.00000000003854376,
                    0.00000000003044556,
                    0.000000000001285428,
                    0.000000000002958072,
                    0.00000000001361112,
                    0.00000000001087008,
                    -0.00000000001867068,
                    -0.00000000002773776,
                    1.0822044E-12,
                    0.00000000002402184,
                    0.00000000007642188,
                    0.00000000001361748,
                    -0.00000000001181718,
                    -0.00000000001394472,
                    -0.0000000000382836,
                    -0.00000000001800096,
                    -0.00000000001944408,
                    0.00000000002055192,
                    0.00000000005398416,
                    0.00000000001733652,
                    -0.0000000000406854,
                    -0.00000000007689816,
                    -0.00000000007676124,
                    -0.00000000005136,
                    -0.00000000007760592,
                    -0.00000000003511944,
                    0.00000000002129364,
                    0.00000000005015508,
                    0.00000000004525728,
                    -0.0000000000238992,
                    -0.00000000004102308,
                    -0.00000000000828102,
                    0.00000000004104336,
                    0.00000000010132656,
                    0.0000000001222944,
                    0.00000000008100516,
                    0.00000000002950776,
                    -0.0000000000160464,
                    -0.0000000000388326,
                    -0.0000000000409806,
                    -0.00000000005909592,
                    -0.00000000005255988,
                    -0.000000000007511088,
                    -0.00000000003256584,
                    -0.00000000004855356,
                    -0.000000000003658356,
                    0.00000000002274336,
                    0.00000000002759736,
                    0.0000000000247074,
                    0.00000000002937408,
                    0.00000000002245116,
                    0.00000000003661152,
                    0.000000000008330988,
                    -0.000000000001990656,
                    0.00000000001525872,
                    0.00000000004302948,
                    0.00000000001213704,
                    -0.00000000002609964,
                    -0.00000000001347048,
                    -0.00000000003108732,
                    -0.0000000000316782,
                    -0.00000000004770588,
                    -0.00000000003864552,
                    -0.00000000002066136,
                    -0.00000000001842096,
                    0.00000000002803152,
                    0.0000000000340308,
                    0.00000000001326036,
                    0.000000000009128592,
                    0.00000000004779972,
                    0.00000000007053252,
                    0.00000000002851512,
                    -0.00000000004754352,
                    -0.00000000008912976,
                    -0.00000000004661124,
                    -0.00000000004577328,
                    -0.00000000004872456,
                    -0.00000000002701992,
                    0.000000000000818268,
                    0.00000000004570716,
                    0.00000000002902764,
                    -0.00000000001840368,
                    7.591164E-13,
                    0.000000000034194,
                    0.0000000000420174,
                    0.00000000002289708,
                    0.00000000003504468,
                    0.00000000001678404,
                    -0.00000000004346388,
                    -0.00000000002473512,
                    -0.000000000001994184,
                    0.00000000001121994,
                    0.00000000003258072,
                    0.0000000000400986,
                    0.000000000006886488,
                    0.00000000001949412,
                    0.0000000000487146,
                    0.00000000002501304,
                    -0.000000000003693708,
                    -0.00000000003196776,
                    -0.000000000007265904,
                    -0.00000000002875236,
                    -0.00000000003501012,
                    -0.000000000010682304,
                    0.00000000001283808,
                    0.000000000002216496,
                    -0.00000000002315208,
                    0.000000000006097608,
                    -0.000000000008885448,
                    -0.00000000003710424,
                    -0.00000000004216152,
                    -0.00000000004761696,
                    0.000000000011010744,
                    0.00000000002983728,
                    0.0000000000267846,
                    -0.000000000007605984,
                    -0.00000000004424604,
                    -0.00000000004716828,
                    -0.00000000001513368,
                    0.00000000006632376,
                    0.0000000000289122,
                    0.000000000011737944,
                    0.00000000001737732,
                    1.1820132E-12,
                    0.000000000005541252,
                    0.000000000023676,
                    0.00000000002784204,
                    0.00000000002799648,
                    -0.000000000009508116,
                    -0.000000000001422288,
                    0.00000000001329336,
                    -0.000000000006289752,
                    -0.00000000002654652,
                    -0.00000000003581448,
                    -0.00000000003819096,
                    -0.00000000003696024,
                    -0.000000000007253544,
                    0.00000000001247856,
                    0.00000000001768932,
                    0.000000000009823236,
                    0.00000000002671584,
                    0.00000000002189856,
                    0.00000000004090296,
                    0.000000000004842204,
                    -0.000000000011829396,
                    0.000000000004103988,
                    -0.000000000004022028,
                    0.000000000008860356,
                    0.00000000003346284,
                    0.0000000000431604,
                    0.00000000002190096,
                    -0.000000000008811228,
                    -0.00000000004949484,
                    -0.00000000005576244,
                    -0.00000000004612152,
                    0.00000000000619014,
                    0.00000000005211492,
                    0.00000000008432808,
                    0.00000000004807596,
                    -0.00000000006392532,
                    -0.0000000001208772,
                    -0.00000000008639712,
                    -0.00000000002809416,
                    0.00000000002347332,
                    0.00000000005723304,
                    0.00000000003867972,
                    -0.000000000008513796,
                    -0.000000000005817624,
                    -0.00000000003239004,
                    -0.00000000004366992,
                    -0.00000000003037668,
                    -0.00000000002281848,
                    0.00000000001406112,
                    0.00000000001908456,
                    0.00000000001178076,
                    -0.00000000000506604,
                    -0.0000000000244326,
                    0.00000000000977154,
                    0.000000000048045,
                    0.00000000006078372,
                    0.00000000008019252,
                    0.00000000005570832,
                    -0.000000000007564476,
                    -0.00000000002280192,
                    -0.00000000000672966,
                    -0.00000000001582872,
                    0.00000000005727636,
                    0.00000000007611156,
                    0.00000000002900148,
                    -0.00000000004803948,
                    -0.00000000007142316,
                    -0.00000000004617,
                    -0.000000000009352452,
                    0.000000000011152872,
                    3.536892E-13,
                    -0.00000000001695624,
                    -0.00000000000125346,
                    0.00000000001573632,
                    -0.00000000002809416,
                    -0.000000000031677,
                    -0.00000000006410976,
                    -0.00000000007422384,
                    -0.0000000000229818,
                    0.00000000002482692,
                    0.00000000003974364,
                    0.0000000000358878,
                    0.00000000001777164,
                    0.00000000001426464,
                    0.00000000001812468,
                    0.0000000000404982,
                    -0.00000000002085264,
                    -0.00000000008255928,
                    -0.0000000000352464,
                    0.000000000008623368,
                    0.00000000003487884,
                    -0.00000000001567236,
                    -0.00000000002054184,
                    -5.332884E-13,
                    0.000000000054246,
                    0.00000000005435976,
                    0.00000000002276652,
                    0.00000000001843428,
                    0.00000000004096488,
                    0.00000000004426308,
                    -0.00000000003932172,
                    -0.00000000008157048,
                    -0.00000000005073084,
                    0.00000000003750168,
                    0.0000000000745578,
                    0.0000000000432096,
                    -0.000000000008664828,
                    -0.00000000004244172,
                    -0.0000000000179148,
                    -0.00000000001411428,
                    -0.00000000001772544,
                    -0.000000000001856184,
                    -0.000000000002442708,
                    0.000000000010961004,
                    0.000000000008050416,
                    -0.00000000002145468,
                    -0.00000000005263392,
                    -0.0000000000287034,
                    -0.00000000004349712,
                    -0.00000000002844264,
                    0.0000000000221766,
                    0.00000000003207588,
                    0.00000000003237132,
                    0.000000000002813844,
                    0.0000000000207372,
                    0.00000000003128952,
                    0.00000000004814568,
                    0.00000000001344792,
                    -0.00000000001308336,
                    -0.000000000009860268,
                    -0.000000000006820728,
                    0.00000000002446512,
                    0.00000000001470132,
                    0.000000000014919,
                    0.00000000001832772,
                    -0.00000000001837428,
                    -0.00000000006841956,
                    -0.00000000005354472,
                    0.000000000008621304,
                    0.00000000004812204,
                    0.00000000003512496,
                    -0.0000000000135738,
                    -0.00000000007776504,
                    -0.00000000007495248,
                    -0.00000000002941992,
                    -0.000000000008474304,
                    0.000000000002680596,
                    0.00000000002154348,
                    0.00000000001827168,
                    0.00000000002284716,
                    0.00000000002823444,
                    -0.000000000005812008,
                    0.00000000004080876,
                    -0.00000000001207236,
                    0.000000000005843808,
                    0.000000000003528156,
                    -0.00000000002337492,
                    -7.536588E-13,
                    0.000000000011487564,
                    0.000000000054429,
                    0.00000000007381536,
                    0.00000000007924668,
                    0.0000000000457476,
                    0.000000000005893956,
                    -0.000000000005928036,
                    -0.00000000001442988,
                    -0.00000000005259432,
                    -0.00000000005493972,
                    -0.0000000000198276,
                    -0.000000000007944516,
                    -0.00000000001957728,
                    -0.00000000004318452,
                    -0.00000000004687692,
                    -0.00000000004073988,
                    -0.0000000000571314,
                    -0.0000000000148128,
                    -3.137064E-13,
                    -0.00000000005854848,
                    -0.00000000003312348,
                    -9.321324E-13,
                    0.00000000003893868,
                    0.0000000000438702,
                    0.00000000003882408,
                    0.00000000005211036,
                    0.00000000006179448,
                    0.00000000003721392,
                    0.00000000002723904,
                    0.00000000005877216,
                    0.00000000004501524,
                    0.000000000010677012,
                    -0.0000000000283596,
                    -0.00000000008341896,
                    -0.00000000004356744,
                    -0.000000000004329228,
                    0.000000000015774,
                    0.00000000001418184,
                    0.00000000002249628,
                    0.000000000008925648,
                    -0.00000000001226052,
                    -0.00000000001353912,
                    -0.000000000001491048,
                    0.0000000000101568,
                    -0.00000000004490088,
                    -0.000000000048603,
                    -0.00000000003108468,
                    0.000000000010936464,
                    0.0000000000164412,
                    -0.000000000001455132,
                    0.000000000010091976,
                    0.000000000008635032,
                    -0.0000000000178518,
                    -0.00000000000314442,
                    -0.00000000001659792,
                    0.000000000003954276,
                    0.0000000000495396,
                    0.00000000003521424,
                    -0.00000000002606808,
                    -0.00000000000900996,
                    0.00000000002712384,
                    0.0000000000095616,
                    -0.00000000003271104,
                    -0.00000000001381344,
                    0.00000000002637084,
                    0.00000000004877604,
                    0.0000000000614904,
                    -0.0000000000477504,
                    -0.00000000007752804,
                    -0.00000000004663332,
                    5.677836E-13,
                    0.00000000003208404,
                    0.00000000005473752,
                    0.000000000004558032,
                    -0.000000000006559224,
                    0.00000000000031122,
                    -0.00000000002158896,
                    -0.00000000005282724,
                    -0.00000000003922488,
                    0.000000000011779368,
                    0.00000000004848372,
                    0.00000000006439644,
                    0.000000000002032272,
                    -0.00000000003912804,
                    -0.00000000002660988,
                    -0.00000000002473764,
                    -0.00000000001456392,
                    -0.00000000001820844,
                    -0.0000000000486984,
                    0.000000000010964748,
                    0.000000000062958,
                    0.00000000004798068,
                    -0.0000000000289896,
                    0.000000000011630208,
                    0.00000000004976748,
                    0.00000000008571696,
                    0.00000000004834164,
                    -0.00000000004265388,
                    -0.00000000006332052,
                    -0.00000000002134728,
                    0.00000000001500948,
                    0.00000000002124204,
                    0.000000000002261136,
                    -0.00000000003500124,
                    -0.0000000000352836,
                    -0.00000000001723224,
                    -0.00000000003431748,
                    -0.0000000000350916,
                    0.0000000000180618,
                    0.00000000005022084,
                    0.0000000000442122,
                    -0.000000000004721376,
                    -0.00000000001475496,
                    -0.00000000004700652,
                    -0.00000000003722436,
                    -0.0000000000343734,
                    0.000000000007132428,
                    0.00000000002549232,
                    0.0000000000192258,
                    0.0000000000317442,
                    0.0000000000036102,
                    0.00000000002251656,
                    0.0000000000185382,
                    -0.000000000005742468,
                    -0.00000000002113032,
                    -0.00000000001881036,
                    0.00000000001307244,
                    -0.000000000002508384,
                    -0.000000000067335,
                    -0.00000000004670784,
                    0.00000000002810568,
                    0.00000000009409032,
                    0.00000000006351384,
                    0.00000000003449544,
                    -0.00000000001421004,
                    -0.00000000001630848,
                    -0.000000000009143388,
                    0.000000000007832352,
                    0.00000000001094172,
                    0.00000000003926928,
                    0.00000000005653164,
                    -0.00000000001428552,
                    -0.00000000007687752,
                    -0.00000000006983676,
                    0.0000000000166008,
                    0.0000000000293316,
                    -0.00000000002652516,
                    -0.00000000010283892,
                    -0.00000000008732556,
                    -0.00000000005142996,
                    0.00000000002885424,
                    0.00000000006014076,
                    0.0000000000333762,
                    0.00000000001764684,
                    0.00000000001571892,
                    0.00000000003306828,
                    0.00000000003401136,
                    0.0000000000159816,
                    0.00000000002532132,
                    0.0000000000270732,
                    0.00000000001395696,
                    0.0000000000146478,
                    -0.00000000001787256,
                    -0.00000000005249748,
                    -0.00000000007321512,
                    -0.00000000003236724,
                    -0.00000000002635968,
                    -0.00000000001454688,
                    0.00000000001510236,
                    0.00000000003147216,
                    0.00000000003880644,
                    0.00000000003138696,
                    0.00000000003546108,
                    0.000000000011528352,
                    0.00000000001690416,
                    0.000000000009932328,
                    0.00000000003321276,
                    0.00000000003918312,
                    0.00000000001610376,
                    -0.00000000001462236,
                    -0.00000000007659384,
                    -0.00000000005284332,
                    -0.00000000001339308,
                    0.00000000000870348,
                    -0.00000000004403028,
                    -0.00000000004628772,
                    -0.00000000002472984,
                    -0.000000000010904856,
                    0.00000000003020472,
                    0.00000000003930012,
                    -0.00000000000789846,
                    -0.00000000001843392,
                    0.00000000003553224,
                    0.0000000000220338,
                    -0.00000000001212264,
                    -0.00000000004784508,
                    -0.00000000003055752,
                    0.00000000004962072,
                    0.0000000000750882,
                    0.00000000002419188,
                    8.363688E-13,
                    -0.00000000004981824,
                    0.000000000002488572,
                    0.000000000011105844,
                    0.00000000001741044,
                    -0.000000000008157432,
                    -0.00000000003516936,
                    -0.000000000007304556,
                    0.00000000002437584,
                    0.00000000004290432,
                    0.00000000001430712,
                    -0.00000000003050724,
                    -0.00000000004096812,
                    0.000000000011530788,
                    0.0000000000716742,
                    0.00000000005850972,
                    -0.0000000000189294,
                    -0.00000000003134208,
                    -0.00000000002878596,
                    -0.00000000006534504,
                    -0.0000000000588738,
                    -0.000000000005197188,
                    -0.00000000002675196,
                    -0.0000000000284616,
                    0.00000000001797972,
                    0.00000000004164264,
                    0.00000000002144316,
                    0.00000000004087008,
                    0.0000000000199782,
                    -0.00000000002344272,
                    -0.000000000002284884,
                    0.00000000001394388,
                    0.00000000000828042,
                    0.0000000000315912,
                    0.00000000002865348,
                    0.000000000003531384,
                    -0.00000000001416408,
                    -0.00000000002696196,
                    0.0000000000148704,
                    0.00000000004824312,
                    0.00000000001150788,
                    -0.00000000007456068,
                    -0.0000000000712338,
                    -0.00000000003272688,
                    -0.00000000003528408,
                    -0.00000000002020908,
                    -0.000000000006103416,
                    -0.000000000004656312,
                    0.0000000000593148,
                    0.00000000007429716,
                    0.00000000002825748,
                    -0.0000000000205392,
                    4.246368E-13,
                    0.00000000003262152,
                    0.00000000003659892,
                    0.000000000003692316,
                    0.0000000000143442,
                    0.00000000003787176,
                    -0.0000000000246414,
                    -0.00000000005599308,
                    -0.00000000003331296,
                    -0.000000000010713372,
                    0.000000000007598616,
                    0.0000000000025167,
                    -0.00000000004566444,
                    -0.0000000000124914,
                    0.00000000001412688,
                    -0.000000000010130616,
                    -0.00000000002106432,
                    -0.00000000006438984,
                    -0.00000000005426244,
                    0.00000000002236572,
                    0.0000000000583674,
                    0.00000000004919592,
                    0.000000000002478468,
                    -0.00000000001332348,
                    0.00000000001988976,
                    0.00000000003305724,
                    0.00000000005715648,
                    0.00000000006174024,
                    0.00000000006760656,
                    0.0000000000172428,
                    -0.00000000001841676,
                    -0.00000000003616764,
                    -0.0000000000443826,
                    -0.00000000003468768,
                    -0.00000000003795924,
                    -0.00000000005876784,
                    -0.00000000004607928,
                    -0.00000000003609792,
                    -0.00000000004520028,
                    -0.00000000001582908,
                    0.00000000004057728,
                    0.00000000006285552,
                    0.00000000010156548,
                    0.00000000009847056,
                    0.00000000002661588,
                    -0.00000000002931744,
                    -0.00000000007114008,
                    -0.0000000000738294,
                    -0.0000000000170742,
                    0.0000000000743946,
                    0.00000000001678908,
                    -0.00000000005259576,
                    -0.0000000000598176,
                    -0.00000000001374576,
                    0.00000000005149272,
                    0.00000000002905032,
                    -0.000000000000961782,
                    -0.00000000003288612,
                    -0.000000000005563188,
                    0.00000000001510104,
                    -0.00000000002474628,
                    -0.00000000004495116,
                    0.00000000001780404,
                    0.00000000004273248,
                    0.00000000003556428,
                    0.00000000001293132,
                    -0.00000000002917608,
                    -0.00000000003812832,
                    0.00000000002940024,
                    0.00000000005759976,
                    0.00000000003452568,
                    -0.00000000004999284,
                    -0.00000000003186504,
                    8.993544E-13,
                    0.00000000002794872,
                    0.00000000003577968,
                    -0.00000000001571772,
                    -0.00000000001532148,
                    0.0000000000314448,
                    0.000000000001611564,
                    -0.000000000002369016,
                    -0.000000000007018164,
                    -0.00000000002718204,
                    -5.393616E-13,
                    0.0000000000597186,
                    0.00000000004519188,
                    -0.00000000003860772,
                    -0.00000000006202464,
                    -0.00000000003235464,
                    -0.00000000000946998,
                    -0.000000000005177244,
                    -0.0000000000138894,
                    -0.00000000004644108,
                    -0.000000000009557436,
                    0.00000000002150676,
                    -0.00000000003364296,
                    -0.00000000007948092,
                    -0.000000000003022224,
                    0.00000000007298448,
                    0.00000000006632664,
                    0.00000000003912888,
                    0.000000000011478444,
                    0.0000000000337734,
                    0.00000000002910132,
                    -0.00000000001971108,
                    -0.00000000005400996,
                    0.000000000002062164,
                    0.00000000005737092,
                    0.0000000000392028,
                    -0.00000000000901968,
                    -0.00000000005580528,
                    -0.00000000004149912,
                    0.000000000003508956,
                    0.00000000001690728,
                    0.00000000001211484,
                    -0.000000000005895408,
                    -0.00000000001320012,
                    -0.000000000008576376,
                    0.00000000002927112,
                    0.00000000002545044,
                    0.00000000000531744,
                    -0.00000000001102998,
                    -0.00000000001429008,
                    0.00000000001814544,
                    0.00000000001987356,
                    -0.00000000001273692,
                    -0.00000000002455332,
                    -0.00000000001349352,
                    0.000000000005227092,
                    0.00000000003333984,
                    0.00000000001108644,
                    -0.00000000003186636,
                    -0.00000000007930368,
                    -0.00000000004804212,
                    0.000000000009527628,
                    -0.000000000009511632,
                    0.00000000001812312,
                    0.00000000002336544,
                    0.00000000001645284,
                    0.000000000005189916,
                    -0.00000000003232032,
                    -0.00000000002078952,
                    0.00000000002393232,
                    0.00000000008014872,
                    0.00000000005081016,
                    -0.00000000001537356,
                    -0.00000000002971848,
                    -0.00000000000805338,
                    0.00000000001997856,
                    0.00000000002560932,
                    4.113108E-13,
                    -0.000000000001450332,
                    -0.00000000001723884,
                    -0.000000000021705,
                    -0.00000000004159584,
                    -0.00000000002321208,
                    2.697936E-13,
                    5.779104E-13,
                    1.0376556E-12,
                    -0.00000000002768796,
                    0.000000000002077212,
                    0.000000000011800248,
                    0.00000000005239584,
                    0.00000000005544624,
                    0.0000000000369624,
                    -0.00000000001990656,
                    -0.0000000000729714,
                    -0.0000000000391368,
                    0.00000000004243476,
                    0.00000000003291996,
                    0.00000000002360544,
                    0.00000000004001412,
                    0.00000000002269992,
                    0.000000000010861344,
                    0.000000000005176392,
                    -0.00000000003534948,
                    -0.00000000004020612,
                    -0.000000000010192644,
                    -0.00000000003608928,
                    -0.00000000004207716,
                    -0.00000000006918636,
                    -0.0000000000153798,
                    0.00000000005894616,
                    0.00000000007148028,
                    -0.0000000000272772,
                    -0.00000000006081804,
                    -0.00000000004510068,
                    -0.000000000011210532,
                    0.000000000018906,
                    0.00000000001789572,
                    0.00000000006485268,
                    0.00000000004445268,
                    0.0000000000218808,
                    -0.00000000001529652,
                    -0.0000000000290556,
                    0.0000000000164184,
                    0.00000000004313748,
                    0.00000000002051388,
                    0.000000000002939676,
                    9.187788E-14,
                    -0.000000000005385456,
                    -0.000000000030948,
                    -0.00000000004065708,
                    -0.00000000000847248,
                    0.00000000002266296,
                    -0.00000000000719082,
                    -0.000000000002804112,
                    -0.00000000002066052,
                    -0.0000000000409206,
                    -0.00000000003990936,
                    -0.00000000001343712,
                    0.00000000001565076,
                    0.000000000002654736,
                    0.00000000004143216,
                    0.0000000000288,
                    0.0000000000227466,
                    0.00000000003966132,
                    0.00000000004234116,
                    0.00000000001671684,
                    0.0000000000088479,
                    -0.000000000003127332,
                    0.0000000000183324,
                    0.00000000002053728,
                    -0.00000000001256412,
                    -0.0000000000479676,
                    -0.00000000004837284,
                    -0.000000000039768,
                    0.00000000001694292,
                    0.00000000002883468,
                    0.0000000000226758,
                    -0.000000000005366628,
                    -0.0000000000573384,
                    -0.00000000008364564,
                    0.000000000002863788,
                    0.00000000002276544,
                    -0.000000000009989748,
                    2.585832E-13,
                    0.00000000001396608,
                    0.00000000002222004,
                    -0.00000000002741748,
                    -0.00000000004824876,
                    -0.00000000006791376,
                    -0.00000000002289288,
                    0.00000000006038928,
                    0.00000000008862888,
                    0.00000000004402872,
                    0.000000000007562412,
                    0.0000000000129342,
                    0.00000000001222032,
                    0.00000000001603872,
                    0.00000000001997604,
                    0.00000000004048608,
                    0.00000000001244544,
                    -0.00000000002006952,
                    -0.0000000000522246,
                    -0.00000000001076274,
                    0.00000000004401852,
                    0.000000000008845776,
                    -0.00000000002675616,
                    -0.00000000002614584,
                    -0.00000000002204064,
                    0.00000000001355184,
                    0.0000000000184674,
                    -0.00000000001322592,
                    -0.00000000002938524,
                    0.00000000000219426,
                    0.00000000002855172,
                    -0.00000000002224308,
                    -0.00000000002414784,
                    0.000000000002274036,
                    0.0000000000561888,
                    0.00000000002078988,
                    0.000000000007955928,
                    -0.000000000006419904,
                    -0.0000000000411102,
                    -0.00000000001282764,
                    0.000000000010992804,
                    -0.00000000002808504,
                    -0.00000000004537716,
                    -0.00000000006174732,
                    -0.00000000003504252,
                    -0.0000000000269244,
                    0.00000000001837896,
                    0.00000000008752704,
                    0.0000000000541164,
                    0.00000000002672952,
                    0.000000000006057276,
                    0.000000000008894244,
                    -0.000000000007276284,
                    -6.985164E-13,
                    0.000000000034782,
                    0.00000000003956112,
                    0.00000000001214676,
                    -0.0000000000246258,
                    -0.0000000000330444,
                    -0.00000000002257728,
                    -0.00000000004728228,
                    -0.0000000000161052,
                    0.00000000002134356,
                    0.000000000011190888,
                    -0.000000000009735432,
                    -0.00000000001575384,
                    -0.000000000010022172,
                    0.00000000001995096,
                    0.00000000001654092,
                    0.00000000002732808,
                    0.00000000002763336,
                    0.00000000003958824,
                    0.00000000006270576,
                    -0.000000000002445324,
                    -0.00000000007749372,
                    -0.00000000006747576,
                    -0.000000000008330376,
                    -0.000000000006237096,
                    0.0000000000209322,
                    0.000000000009915348,
                    -0.00000000003178008,
                    -0.00000000001710636,
                    -0.000000000002006688,
                    -0.00000000001289136,
                    0.00000000000798024,
                    0.00000000001813428,
                    0.00000000002560104,
                    -0.000000000002905068,
                    -0.00000000001543392,
                    -0.00000000001800468,
                    0.00000000002707812,
                    0.00000000003582696,
                    0.000000000009910968,
                    0.000000000008606028,
                    0.000000000006331032,
                    0.00000000004280832,
                    0.00000000002799624,
                    -0.00000000006025212,
                    -0.00000000010090548,
                    -0.00000000006904752,
                    0.000000000009965544,
                    0.00000000003596772,
                    -0.00000000001000062,
                    -0.00000000002649372,
                    -0.000000000011820912,
                    0.0000000000372516,
                    0.00000000003674652,
                    -0.00000000001590168,
                    -0.000000000009104088,
                    0.00000000002228568,
                    0.00000000004130196,
                    0.00000000002428548,
                    -0.00000000002288268,
                    9.158532E-13,
                    0.00000000004101384,
                    0.00000000003773652,
                    0.00000000003830304,
                    -0.000000000002098824,
                    -0.00000000003478716,
                    -0.0000000000158064,
                    0.00000000001331964,
                    0.00000000002594112,
                    -0.000000000011095632,
                    -0.00000000007603368,
                    -0.0000000000770124,
                    -0.00000000002277636,
                    0.00000000002948592,
                    0.00000000002006868,
                    0.0000000000251016,
                    0.00000000003053532,
                    0.000000000009253428,
                    -0.000000000019491,
                    -0.00000000005815548,
                    -0.00000000007204476,
                    -0.00000000001095564,
                    0.00000000007068612,
                    0.00000000006014412,
                    0.00000000003047844,
                    0.00000000002232288,
                    -0.00000000002256924,
                    -0.0000000000516828,
                    -0.00000000001568832,
                    0.00000000000787044,
                    0.00000000001437048,
                    0.00000000001827516,
                    4.641264E-13,
                    -0.000000000026775,
                    6.539556E-13,
                    0.00000000002735004,
                    0.00000000001356144,
                    -0.000000000008766936,
                    -0.000000000007081032,
                    0.00000000002236224,
                    0.0000000000195924,
                    -0.000000000008802792,
                    -0.000000000009317352,
                    -0.00000000003578316,
                    -0.00000000004653948,
                    -0.00000000003328836,
                    -0.0000000000319248,
                    3.485856E-13,
                    0.000000000006974772,
                    0.00000000003012024,
                    0.00000000003151368,
                    0.0000000000527952,
                    0.00000000006014172,
                    0.00000000006122124,
                    -0.000000000007665588,
                    -0.00000000003068652,
                    -0.00000000005314284,
                    -0.000000000011996208,
                    -0.000000000004064208,
                    -0.00000000001403796,
                    0.000000000003148524,
                    0.000000000017388,
                    0.00000000001873848,
                    -0.00000000004293792,
                    -0.00000000009383052,
                    -0.0000000000474726,
                    0.00000000004790472,
                    0.00000000004859112,
                    0.00000000005341068,
                    0.00000000003204612,
                    0.00000000003083844,
                    0.0000000000273168,
                    0.00000000002996136,
                    -0.00000000001846188,
                    -0.00000000002706456,
                    -0.0000000000441786,
                    -0.000000000003365268,
                    0.000000000005363652,
                    -0.000000000010668444,
                    -0.00000000001765872,
                    -0.00000000004499244,
                    -0.00000000004775568,
                    -0.00000000004079976,
                    -0.00000000001306236,
                    -0.000000000003800712,
                    -0.00000000003764472,
                    -0.00000000006750828,
                    0.00000000002168832,
                    0.00000000007604172,
                    0.00000000010474464,
                    0.0000000001285932,
                    0.000000000060846,
                    0.000000000001983156,
                    0.00000000000703662,
                    -0.00000000002408472,
                    -0.00000000004229436,
                    -0.0000000000395316,
                    -0.000000000005346,
                    -0.00000000003300936,
                    -0.00000000006218028,
                    -0.00000000003783744,
                    6.771756E-13,
                    0.00000000007245612,
                    0.00000000006152508,
                    0.000000000006781164,
                    0.000000000008928288,
                    -0.0000000000249648,
                    -0.00000000003697788,
                    -0.00000000002578956,
                    -0.00000000002325,
                    -0.0000000000248184,
                    -0.000000000010054908,
                    0.00000000004864128,
                    0.00000000004800564,
                    0.000000000010603128,
                    4.637088E-13,
                    0.000000000017577,
                    9.072468E-13,
                    0.00000000001628928,
                    -0.000000000005997348,
                    -0.000000000033435,
                    -0.00000000002082132,
                    0.00000000001707384,
                    -0.000000000008484144,
                    -0.00000000000436254,
                    -0.000000000008938944,
                    -0.00000000001883496,
                    -0.0000000000196008,
                    -0.00000000004055628,
                    0.00000000002527596,
                    0.0000000000364806,
                    0.00000000003717828,
                    0.00000000002202936,
                    -0.00000000002298276,
                    -0.0000000000363792,
                    -0.00000000006089184,
                    -0.00000000004721844,
                    0.00000000004175544,
                    0.00000000004679304,
                    -8.965428E-13,
                    0.00000000000763638,
                    0.000000000005514756,
                    0.00000000000929748,
                    0.00000000002072412,
                    0.0000000000472788,
                    -0.00000000001395948,
                    -0.000000000004669716,
                    0.000000000006246384,
                    0.000000000004948356,
                    0.00000000001229664,
                    -0.00000000003774864,
                    -0.00000000006335568,
                    -0.000000000007698036,
                    0.00000000005516952,
                    0.00000000006257388,
                    -0.00000000003792972,
                    -0.00000000007913748,
                    -0.000000000038439,
                    0.00000000002958144,
                    0.00000000004888488,
                    0.00000000002815272,
                    0.00000000001700616,
                    0.000000000007619016,
                    0.00000000001346964,
                    0.00000000000382296,
                    -0.000000000006610884,
                    -0.000000000009670428,
                    -0.00000000001803684,
                    0.000000000002746656,
                    0.00000000002656488,
                    0.000000000009218712,
                    -0.00000000001324464,
                    -0.00000000003239124,
                    -0.00000000001947564,
                    -0.00000000001810668,
                    -0.00000000001816272,
                    -0.000000000010265964,
                    0.00000000002510724,
                    0.00000000003095376,
                    0.0000000000372828,
                    0.0000000000088059,
                    -0.00000000004020096,
                    -0.00000000005705172,
                    -0.00000000002755428,
                    -0.00000000002189556,
                    0.000000000011638896,
                    -0.00000000003360228,
                    -0.00000000001715628,
                    0.000000000006878544,
                    1.1276004E-12,
                    -0.00000000001915056,
                    0.0000000000179904,
                    0.00000000003865476,
                    0.0000000000659958,
                    0.00000000005420988,
                    -0.00000000001750716,
                    0.00000000001621764,
                    0.00000000005282028,
                    0.00000000004195056,
                    0.0000000000255084,
                    0.000000000011288556,
                    -0.00000000005279424,
                    -0.00000000007584144,
                    -0.00000000008709972,
                    -0.00000000002181756,
                    0.0000000000472398,
                    0.00000000010185384,
                    0.00000000005266668,
                    -0.00000000001543488,
                    -0.00000000003190272,
                    -0.00000000005483976,
                    -0.00000000005437332,
                    -0.0000000000189036,
                    0.00000000004189464,
                    0.00000000004995852,
                    -0.000000000001932612,
                    -0.0000000000434964,
                    -0.00000000004826376,
                    -0.00000000000877866,
                    0.00000000004669008,
                    0.00000000007622796,
                    0.00000000001504392,
                    -0.00000000004251384,
                    -0.00000000004130976,
                    -0.0000000000575568,
                    -0.00000000003080448,
                    -0.00000000000248394,
                    0.000000000007227456,
                    0.000000000009061956,
                    -0.0000000000033948,
                    0.00000000001620084,
                    0.000000000012912,
                    0.000000000026403,
                    0.00000000005175936,
                    -0.00000000000278808,
                    -0.00000000004348872,
                    -0.00000000004386972,
                    0.00000000000876216,
                    0.000000000002458224,
                    -0.00000000003041688,
                    0.00000000002732772,
                    0.0000000000553266,
                    0.000000000040713,
                    -0.00000000001978284,
                    -0.00000000008609796,
                    -0.0000000000642588,
                    0.00000000004235484,
                    0.00000000007655448,
                    0.00000000006052188,
                    0.00000000004791384,
                    0.0000000000296154,
                    0.000000000007423224,
                    0.00000000001451796,
                    0.0000000000095466,
                    -0.00000000003880476,
                    -0.00000000002351856,
                    -0.000000000002100408,
                    -0.000000000010936812,
                    -0.00000000005409564,
                    -0.00000000005868744,
                    -0.00000000002630472,
                    0.0000000000610686,
                    0.00000000005980632,
                    -0.000000000008413008,
                    -0.00000000009518616,
                    -0.00000000008077068,
                    0.00000000001718148,
                    0.00000000006847524,
                    0.00000000001220916,
                    -0.00000000001783308,
                    -0.00000000001369524,
                    -0.00000000000609636,
                    0.00000000002482872,
                    -0.000000000001451244,
                    0.000000000004214412,
                    0.00000000002981784,
                    0.00000000003906552,
                    -0.00000000003283056,
                    -0.00000000005828868,
                    -0.00000000006625128,
                    -0.00000000001928676,
                    -0.0000000000249108,
                    0.0000000000144042,
                    0.00000000002916828,
                    0.00000000005058288,
                    0.00000000004341,
                    -0.000000000009143124,
                    -0.00000000003511188,
                    0.00000000000853926,
                    0.00000000006033396,
                    0.00000000008271312,
                    0.00000000006607884,
                    0.00000000002705208,
                    -0.000000000001358988,
                    -0.00000000004894104,
                    -0.00000000005055444,
                    -0.0000000000564,
                    0.00000000002165796,
                    0.00000000006717576,
                    0.00000000003348828,
                    -0.00000000002288316,
                    -0.00000000006471348,
                    -0.00000000007332132,
                    -9.004308E-13,
                    0.00000000003216672,
                    0.000000000005931084,
                    -0.00000000002248404,
                    -0.00000000000602316,
                    -0.00000000001738944,
                    -0.0000000000406278,
                    -0.00000000001795896,
                    0.00000000000783522,
                    0.00000000004011252,
                    0.00000000004946376,
                    -0.000000000004483848,
                    -0.00000000003496176,
                    -0.00000000005526192,
                    0.00000000001760892,
                    0.00000000003702492,
                    0.00000000001359012,
                    -0.000000000008351184,
                    -0.0000000000134772,
                    -0.000000000008016108,
                    -0.000000000005935092,
                    1.736352E-13,
                    -0.000000000004068096,
                    0.000000000010300956,
                    0.00000000006167412,
                    0.0000000000518274,
                    -0.0000000000138246,
                    -0.00000000006196572,
                    -0.00000000005986452,
                    0.00000000003806424,
                    0.00000000006741528,
                    0.000000000009785664,
                    -0.00000000004280724,
                    -0.00000000002579244,
                    0.00000000002110596,
                    0.00000000000974208,
                    0.000000000011250528,
                    -0.00000000002429808,
                    -0.00000000003388668,
                    0.00000000000922554,
                    0.00000000002874456,
                    0.0000000000759528,
                    0.00000000002980296,
                    -0.00000000004018188,
                    -0.00000000007496496,
                    -0.00000000002435352,
                    0.00000000005696676,
                    0.0000000000479184,
                    0.000000000003473724,
                    -0.00000000001910604,
                    -0.00000000003735864,
                    0.00000000003246624,
                    0.0000000000386748,
                    -0.00000000004029168,
                    -0.0000000000842688,
                    -0.0000000000279822,
                    0.000000000010157004,
                    0.00000000002833524,
                    0.000000000001866144,
                    -0.000000000010950852,
                    0.000000000007351236,
                    -0.00000000000387918,
                    -0.00000000003439872,
                    -0.0000000000267588,
                    -0.00000000001671732,
                    0.0000000000354816,
                    0.00000000007401576,
                    0.00000000002735676,
                    1.0129776E-12,
                    -0.000000000010344996,
                    -0.000000000010462968,
                    -0.000000000054591,
                    -0.00000000003535512,
                    -0.000000000008641656,
                    -0.00000000001388628,
                    0.00000000001622004,
                    0.00000000003459768,
                    0.00000000004229868,
                    0.00000000003176124,
                    0.00000000004137204,
                    0.00000000005152272,
                    0.00000000002941932,
                    -0.00000000002686608,
                    -0.000000000053736,
                    -0.00000000001357104,
                    0.00000000002160672,
                    0.000000000006750456,
                    -0.00000000005279208,
                    -0.00000000003093804,
                    -0.00000000003170028,
                    -0.00000000002053716,
                    0.000000000006644124,
                    -0.00000000002113668,
                    -0.00000000002446692,
                    0.00000000006114912,
                    0.00000000006012192,
                    0.0000000000168576,
                    -0.000000000035463,
                    0.000000000003153492,
                    0.0000000000256716,
                    0.00000000001082676,
                    0.00000000004056816,
                    0.000000000004489968,
                    -0.00000000002709204,
                    -0.00000000001675128,
                    0.00000000002221428,
                    -0.0000000000900342,
                    -0.00000000009019704,
                    0.0000000000077811,
                    0.00000000004237608,
                    0.00000000002330568,
                    0.000000000009192552,
                    -0.00000000001278636,
                    -0.00000000001202952,
                    -0.00000000000279522,
                    0.00000000001635204,
                    0.00000000002727216,
                    0.00000000004813392,
                    0.00000000004803396,
                    -0.000000000002205648,
                    -0.00000000002503944,
                    -0.00000000005477904,
                    -0.00000000005693136,
                    -0.0000000000348432,
                    0.000000000009281748,
                    0.00000000007882476,
                    0.00000000008138508,
                    0.00000000002366544,
                    -0.00000000001947888,
                    -0.0000000000475932,
                    -0.00000000004770636,
                    -0.000000000044235,
                    -0.00000000005380212,
                    -0.00000000001396764,
                    0.00000000004590816,
                    0.00000000006323244,
                    0.00000000002520864,
                    0.00000000002037624,
                    0.000000000002539248,
                    0.00000000001518048,
                    0.00000000003503976,
                    -0.00000000001981212,
                    -0.0000000000315612,
                    0.000000000005547168,
                    0.00000000001960548,
                    0.000000000002702616,
                    -0.00000000003223476,
                    -0.00000000003239004,
                    0.000000000010212192,
                    0.00000000004492116,
                    0.00000000006139728,
                    -0.00000000003338448,
                    -0.00000000006291936,
                    -0.00000000003558036,
                    0.00000000001534848,
                    0.00000000001656564,
                    -0.00000000002763804,
                    -0.00000000004255236,
                    -0.000000000010692228,
                    0.00000000003297072,
                    0.00000000003305088,
                    -0.000000000019218,
                    -0.00000000002982444,
                    -0.00000000001822848,
                    0.00000000002405028,
                    -0.0000000000125526,
                    -0.00000000003534636,
                    -0.00000000001474632,
                    0.00000000004999836,
                    0.0000000000897786,
                    0.00000000006317112,
                    -0.000000000008563464,
                    -0.0000000000685644,
                    -0.00000000004906668,
                    -0.00000000000698976,
                    0.0000000000341544,
                    0.00000000005761968,
                    0.00000000007516308,
                    0.00000000003023256,
                    -0.00000000004076268,
                    -0.00000000008168988,
                    -0.00000000006660264,
                    -0.00000000005910252,
                    0.00000000004018932,
                    0.00000000005481216,
                    0.00000000006028848,
                    0.000000000008057124,
                    -0.00000000001279212,
                    -0.000000000002453076,
                    0.00000000001669512,
                    0.000000000000594834,
                    -0.00000000004569072,
                    -0.00000000005888904,
                    -0.00000000006972192,
                    -0.0000000000277602,
                    0.00000000007176768,
                    0.00000000005675604,
                    -0.00000000000381174,
                    -0.00000000001512468,
                    -0.00000000002503188,
                    -0.000000000011973264,
                    0.00000000000813126,
                    0.00000000004501512,
                    -0.00000000001221252,
                    0.00000000001383792,
                    0.00000000004676568,
                    0.000000000025581,
                    0.00000000002253684,
                    -0.00000000002299752,
                    -0.000000000009322248,
                    -0.000000000006329472,
                    -0.00000000004467816,
                    -0.00000000003455016,
                    -0.000000000007055868,
                    0.000000000006611628,
                    -9.794628E-13,
                    0.0000000000134466,
                    0.00000000002530632,
                    0.000000000008808504,
                    -8.940804E-13,
                    -0.00000000001338768,
                    0.00000000001779936,
                    0.00000000006189984,
                    0.0000000000262764,
                    -8.272848E-13,
                    -0.00000000008927616,
                    -0.00000000007853604,
                    -0.00000000006387204,
                    -0.00000000002863548,
                    0.00000000002232864,
                    0.00000000005784468,
                    0.00000000005536884,
                    0.00000000003642072,
                    -0.00000000001917852,
                    -0.00000000001919616,
                    -0.00000000003427896,
                    -0.00000000001781748,
                    0.00000000003639984,
                    0.00000000005282484,
                    0.00000000003505872,
                    -0.00000000002421276,
                    -0.00000000005026368,
                    -0.00000000003061788,
                    0.0000000000662448,
                    0.0000000000558942,
                    0.000000000004294992,
                    0.00000000002215596,
                    0.00000000003264432,
                    -0.000000000007131864,
                    -0.00000000005106792,
                    -0.000000000049044,
                    -0.000000000022722,
                    5.993052E-13,
                    0.00000000007271016,
                    0.00000000001718244,
                    -0.00000000003914928,
                    -0.00000000003231552,
                    -0.000000000011246892,
                    -0.00000000002812932,
                    -0.00000000004111692,
                    -0.00000000002391372,
                    0.00000000002201916,
                    -0.00000000001548336,
                    -0.000000000010911936,
                    -0.000000000006538092,
                    0.0000000000275112,
                    0.00000000001559892,
                    -0.000000000009377016,
                    -0.0000000000295836,
                    -0.000000000019554,
                    0.00000000005876388,
                    0.00000000010823364,
                    0.00000000003732708,
                    -0.00000000003680412,
                    -0.000000000007946376,
                    0.00000000004706964,
                    0.00000000002641584,
                    -0.00000000002873064,
                    -0.00000000004396032,
                    -0.00000000002793216,
                    0.000000000010047756,
                    -0.00000000002364564,
                    0.000000000005485728,
                    0.00000000003147336,
                    -0.0000000000211278,
                    -0.00000000003083544,
                    -0.00000000003081228,
                    -0.00000000004116456,
                    0.00000000001473552,
                    0.00000000004922868,
                    0.00000000002708904,
                    0.000000000001682616,
                    0.000000000002150964,
                    0.00000000001928796,
                    0.00000000001950324,
                    0.00000000003327228,
                    0.0000000000360156,
                    -0.00000000003814512,
                    -0.00000000005127372,
                    -0.0000000000307512,
                    -0.00000000002639376,
                    -0.00000000002286564,
                    0.00000000001387956,
                    0.00000000002819064,
                    0.00000000002858292,
                    0.00000000003155556,
                    0.00000000004239864,
                    -0.00000000001682688,
                    -0.00000000002749572,
                    -0.00000000004034808,
                    -0.00000000004595028,
                    -0.00000000002311632,
                    0.000000000007361136,
                    0.00000000001863612,
                    -0.000000000011641032,
                    -0.000000000010336836,
                    -0.00000000002157564,
                    -0.00000000001059798,
                    0.00000000002653704,
                    0.00000000003180252,
                    -0.000000000011017224,
                    -0.000000000011196336,
                    0.0000000000554658,
                    0.0000000000910038,
                    0.00000000001718892,
                    -0.00000000002395884,
                    -0.00000000004045176,
                    0.000000000001989324,
                    -0.00000000003868176,
                    -0.0000000000752148,
                    -0.000000000011800812,
                    0.00000000002181696,
                    0.00000000001894188,
                    0.00000000002157564,
                    6.679896E-13,
                    0.00000000002494956,
                    0.00000000004577112,
                    0.00000000005853348,
                    -0.00000000002992776,
                    -0.00000000002072484,
                    0.00000000004723152,
                    0.00000000003827952,
                    -0.00000000003542496,
                    -0.00000000005302824,
                    -0.00000000003118932,
                    0.00000000002101056,
                    -0.000000000018,
                    -0.00000000004879956,
                    -0.000000000056112,
                    -0.00000000004355016,
                    0.00000000001267236,
                    -0.00000000000245238,
                    -0.000000000011919552,
                    -0.00000000001289148,
                    0.00000000007799688,
                    0.00000000003957276,
                    0.00000000000954672,
                    -0.00000000001991172,
                    9.968244E-13,
                    0.00000000001379892,
                    0.00000000004343988,
                    -0.00000000001176168,
                    -0.0000000000156648,
                    0.00000000001712328,
                    0.000000000028233,
                    -0.000000000006339912,
                    -0.000000000002310852,
                    -0.00000000003687348,
                    -0.00000000004538136,
                    -0.000000000005289612,
                    0.000000000001685688,
                    0.00000000004840404,
                    0.0000000000770988,
                    0.00000000001843176,
                    -0.00000000002713272,
                    -0.00000000005458968,
                    -0.00000000006385404,
                    -0.00000000000736266,
                    0.00000000003343764,
                    0.00000000002009352,
                    -0.00000000001403232,
                    -0.00000000003488808,
                    -0.00000000005930088,
                    -0.00000000003054636,
                    0.00000000002714316,
                    0.00000000007560108,
                    0.00000000007763832,
                    0.00000000005270724,
                    0.00000000002937192,
                    0.000000000002131236,
                    -0.0000000000089106,
                    -0.00000000002511936,
                    0.000000000005560716,
                    0.0000000000186036,
                    -0.00000000004515636,
                    -0.00000000007774152,
                    -0.00000000006318,
                    -0.00000000004070076,
                    0.00000000001428192,
                    -3.659292E-13,
                    -0.00000000002763168,
                    -5.257116E-13,
                    0.00000000004170996,
                    -0.000000000006170592,
                    -0.00000000002026404,
                    -0.000000000011547108,
                    0.000000000003332304,
                    0.00000000004945872,
                    0.00000000001610808,
                    0.00000000006466692,
                    0.00000000011841576,
                    0.00000000005286,
                    -0.00000000003264456,
                    -0.00000000007216104,
                    -0.0000000000127254,
                    0.0000000000761808,
                    0.00000000005582172,
                    -0.000000000007326432,
                    -0.000000000127104,
                    -0.00000000011460012,
                    -0.000000000002498052,
                    0.00000000006049524,
                    0.00000000000356352,
                    -0.00000000002401512,
                    0.000000000000528576,
                    -0.00000000002905224,
                    -0.000000000005932464,
                    -0.00000000006255816,
                    -0.00000000006999768,
                    -1.0980036E-12,
                    0.00000000000779238,
                    -0.00000000004600212,
                    -0.000000000007053816,
                    0.00000000006052224,
                    0.00000000011625336,
                    0.00000000010105248,
                    0.00000000006948408,
                    0.00000000001924704,
                    0.00000000003647496,
                    -0.00000000003115596,
                    -0.000000000001572384,
                    0.00000000005892312,
                    0.000000000010580508,
                    0.00000000000872118,
                    -0.00000000007084908,
                    -0.00000000009717672,
                    -0.00000000007589784,
                    -0.00000000007639584,
                    -0.0000000000366834,
                    -0.000000000006297024,
                    0.00000000004310304,
                    0.00000000007534944,
                    -0.000000000009433284,
                    -0.00000000004932984,
                    -0.00000000006556488,
                    -0.00000000001245768,
                    0.00000000001433064,
                    0.0000000000728322,
                    0.00000000007511172,
                    0.0000000000182928,
                    0.00000000002045472,
                    -0.00000000002388276,
                    -0.000000000022116,
                    0.00000000000287658,
                    0.000000000003960204,
                    0.00000000002583564,
                    0.0000000000183696,
                    0.0000000000281238,
                    0.000000000010759464,
                    -0.0000000000303222,
                    0.000000000006346704,
                    -0.00000000001395528,
                    0.00000000002916768,
                    0.000000000001347252,
                    -0.00000000006559296,
                    -0.000000000010671588,
                    0.0000000000198054,
                    0.00000000004725084,
                    0.00000000002147064,
                    -0.0000000000632052,
                    -0.00000000008589384,
                    -0.00000000005824572,
                    -0.00000000004133472,
                    -0.000000000046683,
                    -0.000000000001666068,
                    0.00000000005528136,
                    0.00000000003741768,
                    0.000000000011670396,
                    -0.000000000009453744,
                    0.00000000005322504,
                    0.000000000120294,
                    0.00000000010232868,
                    0.000000000001961508,
                    -0.00000000004329672,
                    0.0000000000122808,
                    0.00000000002537604,
                    -0.000000000012585,
                    -0.0000000000472086,
                    -0.00000000005544516,
                    -0.000000000010048188,
                    0.000000000009667416,
                    -0.00000000000629562,
                    -0.00000000006963492,
                    -0.00000000005151264,
                    0.000000000010679916,
                    -0.00000000003743424,
                    -0.0000000000168828,
                    0.000000000001698528,
                    0.00000000002016708,
                    0.00000000004331448,
                    0.0000000000510396,
                    0.00000000001478256,
                    0.000000000002612196,
                    0.00000000003762216,
                    0.00000000005492832,
                    -0.000000000006415236,
                    -0.000000000003775356,
                    -2.424348E-13,
                    -0.00000000001839852,
                    -0.00000000007395732,
                    -0.00000000005343468,
                    -0.00000000002021244,
                    0.0000000000279732,
                    0.00000000005778912,
                    -0.000000000009935916,
                    -0.00000000006081804,
                    -0.0000000000458976,
                    -0.000000000003995208,
                    0.00000000005571264,
                    0.0000000000608172,
                    0.00000000003136452,
                    -0.000000000009472308,
                    -0.0000000000179796,
                    0.000000000003070368,
                    0.00000000001840176,
                    -0.000000000002372364,
                    -0.00000000002440224,
                    0.00000000002598756,
                    0.00000000003168816,
                    -3.713328E-13,
                    -0.000000000032358,
                    -0.00000000005730864,
                    -6.769452E-13,
                    -1.878396E-13,
                    0.00000000002836752,
                    -5.808396E-13,
                    -0.00000000004263696,
                    0.00000000000150918,
                    0.00000000001795812,
                    0.00000000005003664,
                    0.00000000002881824,
                    0.00000000001860708,
                    -0.00000000002533284,
                    -0.00000000005389092,
                    0.00000000001252344,
                    0.000000000005913888,
                    0.000000000010900524,
                    -0.00000000001759356,
                    -0.00000000001527708,
                    0.000000000005123892,
                    0.000000000001457136,
                    0.00000000004321584,
                    0.0000000000144624,
                    -0.0000000000188226,
                    0.00000000001544244,
                    -0.000000000010116036,
                    -0.00000000003984228,
                    -0.00000000005782092,
                    -0.0000000000270738,
                    0.000000000011228496,
                    -0.000000000001433712,
                    0.00000000000661104,
                    -0.00000000002561064,
                    0.00000000003389616,
                    0.000000000009994992,
                    -0.00000000002147832,
                    -0.000000000008937324,
                    -0.00000000001280076,
                    0.00000000005013768,
                    0.00000000008682624,
                    0.00000000001951812,
                    -0.00000000003981516,
                    -0.00000000003636588,
                    -0.000000000010871256,
                    0.000000000009960912,
                    0.00000000004108212,
                    0.00000000005634144,
                    0.00000000003661968,
                    0.00000000005333304,
                    -0.00000000003831876,
                    -0.00000000010059744,
                    -0.00000000006876012,
                    0.000000000010674924,
                    0.00000000004100004,
                    0.00000000004312116,
                    -0.00000000001622928,
                    -0.0000000000445566,
                    -0.00000000003348264,
                    -0.00000000002061108,
                    -0.00000000002713524,
                    0.00000000001944432,
                    0.0000000000644298,
                    0.00000000008186796,
                    0.00000000002883108,
                    -0.00000000001286844,
                    -0.00000000005148672,
                    -0.00000000006224208,
                    -0.00000000003144552,
                    -0.0000000000191214,
                    -0.00000000002332968,
                    -0.000000000005196168,
                    0.000000000006680772,
                    0.000000000030639,
                    -0.00000000000259542,
                    -0.00000000003679152,
                    0.000000000002037,
                    0.000000000008639004,
                    0.000000000006527616,
                    0.000000000021414,
                    0.0000000000329754,
                    0.00000000002909964,
                    0.00000000007104312,
                    0.000000000007025856,
                    -0.00000000006253644,
                    -0.00000000002139648,
                    -0.000000000009318252,
                    0.00000000004617324,
                    0.0000000000191358,
                    -0.000000000010492224,
                    0.000000000019743,
                    -0.00000000002039796,
                    -0.00000000005448468,
                    -0.00000000004149048,
                    -0.00000000001421844,
                    0.0000000000268152,
                    0.00000000004715964,
                    0.00000000004776972,
                    0.00000000001461324,
                    0.000000000011598648,
                    0.00000000001567812,
                    0.00000000001802976,
                    -0.000000000001761252,
                    -0.00000000007137192,
                    -0.00000000004626444,
                    -0.00000000002065704,
                    0.000000000033108,
                    0.00000000002961084,
                    -0.00000000002280348,
                    -0.00000000003206844,
                    -0.00000000002829468,
                    -0.000000000007702704,
                    0.000000000003550212,
                    -0.00000000002772024,
                    -0.00000000003618948,
                    -0.00000000006051012,
                    0.00000000001414608,
                    0.0000000000298098,
                    0.00000000007519572,
                    0.00000000008204448,
                    -0.00000000001612956,
                    -0.0000000000359106,
                    -0.00000000002116224,
                    0.000000000003159528,
                    0.00000000001138236,
                    0.00000000001390416,
                    0.00000000003438588,
                    0.00000000000869118,
                    0.00000000002284404,
                    -0.000000000001152318,
                    -0.00000000002654748,
                    -0.00000000002858112,
                    0.000000000004758828,
                    0.0000000000918672,
                    0.00000000003823116,
                    -0.00000000001582968,
                    -0.00000000003127464,
                    -0.00000000002762952,
                    -2.986728E-13,
                    -0.0000000000252222,
                    -0.00000000001305468,
                    0.00000000001754304,
                    0.00000000005463816,
                    0.00000000005019072,
                    -0.00000000002493468,
                    -0.00000000004958292,
                    -0.000000000092955,
                    -0.00000000004563828,
                    -0.000000000013074,
                    -0.00000000004125072,
                    -0.00000000000944442,
                    -0.000000000005069688,
                    0.00000000004843884,
                    -0.000000000006386796,
                    -0.00000000004911864,
                    0.00000000002255208,
                    0.0000000000477756,
                    0.00000000007708596,
                    0.00000000003707772,
                    -0.0000000000241014,
                    -0.000000000002695188,
                    0.00000000002165676,
                    0.00000000005011524,
                    -0.00000000001792416,
                    -0.00000000003401856,
                    0.00000000001742112,
                    0.00000000002564676,
                    0.00000000000977232,
                    -0.00000000006183432,
                    0.0000000000122688,
                    0.00000000001570968,
                    0.00000000001626,
                    0.000000000009168288,
                    -0.00000000007855632,
                    -0.00000000002794572,
                    0.00000000001423632,
                    0.00000000005178912,
                    0.00000000002196264,
                    -0.000000000002314632,
                    0.0000000000089418,
                    -0.000000000002865888,
                    0.000000000009984228,
                    0.0000000000176178,
                    -0.0000000000181326,
                    -0.00000000001989624,
                    -0.0000000000606552,
                    -0.00000000002487888,
                    -0.00000000003484656,
                    -0.00000000001269372,
                    -0.000000000005103576,
                    -0.00000000002798808,
                    -0.0000000000247698,
                    -0.000000000001795164,
                    0.00000000005765352,
                    0.0000000000843246,
                    0.00000000006202212,
                    0.00000000002826912,
                    -0.00000000003151332,
                    -0.00000000002952168,
                    -0.0000000000369996,
                    -0.000000000008853504,
                    0.00000000002731956,
                    0.00000000005096328,
                    0.00000000006299076,
                    0.000000000002481108,
                    -0.00000000003329604,
                    -0.00000000007673292,
                    -0.0000000000400878,
                    -0.000000000007385736,
                    0.00000000002410932,
                    0.00000000002600952,
                    0.000000000002351448,
                    0.00000000002782704,
                    0.00000000002504568,
                    -0.00000000002633592,
                    -0.00000000001514376,
                    -0.00000000001944024,
                    0.0000000000638694,
                    0.00000000002896776,
                    0.000000000003488556,
                    -0.00000000002472504,
                    -0.00000000006714516,
                    -0.00000000003660612,
                    -0.00000000004974984,
                    -0.00000000004767936,
                    -0.00000000000886356,
                    0.00000000000671202,
                    0.000000000035028,
                    -0.00000000000908892,
                    -0.00000000000368508,
                    0.00000000002660328,
                    0.00000000004730604,
                    0.000000000067443,
                    -0.000000000010614948,
                    0.00000000002621088,
                    0.00000000003231396,
                    0.00000000002001768,
                    0.00000000000399228,
                    -0.0000000000548916,
                    -0.000000000008504004,
                    0.00000000002534604,
                    0.0000000000512004,
                    -0.00000000002418876,
                    -0.00000000008696844,
                    -0.00000000004271928,
                    -0.00000000001509444,
                    0.000000000003595788,
                    -0.00000000002915388,
                    -0.00000000002281332,
                    0.0000000000436128,
                    0.00000000001350876,
                    -0.000000000010558212,
                    -0.00000000005501076,
                    0.000000000005626452,
                    0.00000000007712652,
                    0.00000000004026516,
                    0.00000000001919664,
                    -0.00000000005473548,
                    -0.00000000003903636,
                    0.00000000005153796,
                    0.00000000008181408,
                    0.00000000002590656,
                    -0.00000000001617672,
                    0.000000000001945752,
                    -0.000000000005919924,
                    0.000000000006460668,
                    -0.00000000001740108,
                    -0.00000000006367272,
                    0.00000000001292424,
                    0.000000000002117316,
                    -0.000000000001496352,
                    -0.00000000005194404,
                    -0.000000000050628,
                    -0.00000000001118466,
                    0.000000000005112804,
                    0.00000000002951076,
                    0.00000000001667496,
                    0.00000000005276208,
                    0.00000000005021352,
                    -0.00000000003193188,
                    -0.00000000002125908,
                    -0.00000000004327332,
                    0.00000000002477448,
                    0.00000000003132156,
                    0.000000000006861888,
                    -0.0000000000196572,
                    -0.0000000000626502,
                    0.00000000001416192,
                    -0.000000000002827368,
                    -0.000000000001281408,
                    -0.00000000002780448,
                    -0.00000000006043572,
                    0.00000000001880244,
                    0.000000000008763336,
                    0.00000000002300544,
                    0.00000000007901088,
                    0.00000000008604192,
                    0.0000000000474426,
                    -0.00000000005460756,
                    -0.00000000004943448,
                    -0.00000000002808828,
                    0.00000000004612656,
                    0.00000000005633016,
                    -0.00000000002442,
                    -0.0000000000339618,
                    -0.00000000002431452,
                    0.00000000001432116,
                    0.0000000000298026,
                    -0.000000000012429,
                    -0.00000000003911904,
                    -0.000000000008151516,
                    0.000000000060858,
                    -0.00000000000327546,
                    -0.0000000000532632,
                    -0.0000000000120294,
                    6.885024E-14,
                    0.00000000003285096,
                    0.00000000002257884,
                    -0.00000000003699864,
                    -0.00000000007093224,
                    -0.00000000002632392,
                    0.00000000005621568,
                    0.00000000002974248,
                    0.0000000000025479,
                    -0.0000000000252102,
                    -0.00000000003916644,
                    -0.0000000000718242,
                    -0.0000000000500514,
                    0.00000000005490516,
                    0.00000000005740044,
                    0.00000000001940976,
                    0.000000000004506984,
                    0.000000000003262248,
                    0.00000000002675376,
                    -0.00000000000996636,
                    0.000000000005051424,
                    0.00000000001646448,
                    0.00000000004741404,
                    0.00000000008012568,
                    0.00000000006815988,
                    0.00000000001827912,
                    -0.0000000000802308,
                    -0.0000000000506502,
                    -0.00000000003728832,
                    -0.0000000000158544,
                    -8.536404E-13,
                    -0.0000000000236586,
                    0.00000000002817408,
                    -0.0000000000111936,
                    -0.00000000000826506,
                    -0.00000000002558652,
                    -0.00000000006002928,
                    0.000000000003613536,
                    0.00000000002289048,
                    0.000000000005587704,
                    -0.00000000004445652,
                    -0.00000000003540852,
                    0.00000000005767188,
                    0.00000000009312948,
                    0.00000000008513148,
                    -0.00000000001707804,
                    -0.00000000003928092,
                    -0.00000000001724208,
                    -0.00000000003610164,
                    0.00000000002771928,
                    -0.00000000003554436,
                    -0.000000000029355,
                    -0.000000000004537536,
                    0.00000000001020852,
                    5.973216E-13,
                    -0.00000000003324336,
                    0.00000000005188896,
                    0.00000000004521492,
                    0.00000000004838316,
                    -0.000000000003504864,
                    -0.00000000005675652,
                    0.00000000002733696,
                    -0.00000000001811292,
                    -0.00000000006702624,
                    -0.00000000005718888,
                    -0.00000000001588416,
                    0.00000000005958108,
                    0.00000000005821512,
                    0.00000000001330932,
                    -0.0000000000532854,
                    -0.00000000003486876,
                    -0.00000000001802448,
                    -0.00000000004783644,
                    -0.00000000002168304,
                    0.00000000002854704,
                    0.00000000010299852,
                    0.00000000010058184,
                    0.00000000002532264,
                    -0.000000000013431,
                    -0.000000000009181536,
                    0.00000000005403864,
                    0.000000000007713648,
                    -0.00000000001969332,
                    -0.00000000006516384,
                    -0.0000000000676752,
                    0.00000000001195206,
                    0.0000000000055098,
                    0.0000000000079266,
                    0.00000000002300736,
                    -0.00000000000661458,
                    -0.00000000002622648,
                    -0.00000000006662616,
                    -0.00000000001867104,
                    0.0000000000314808,
                    0.0000000000515082,
                    0.00000000001056318,
                    -0.00000000004671888,
                    -0.00000000000703266,
                    -0.000000000001428324,
                    0.00000000006455124,
                    0.00000000006735948,
                    -0.00000000004190592,
                    -0.00000000004584204,
                    -0.00000000001345272,
                    -0.000000000002687988,
                    -0.000000000007441656,
                    0.000000000001432044,
                    -0.00000000001470648,
                    0.0000000000034503,
                    0.00000000004867656,
                    -0.00000000001596552,
                    -0.00000000003669312,
                    -0.00000000003701376,
                    -0.0000000000437874,
                    0.00000000002432412,
                    0.000000000019968,
                    0.000000000010346244,
                    0.000000000015318,
                    0.000000000010286832,
                    0.00000000001423764,
                    -0.000000000004469532,
                    0.00000000004568712,
                    0.00000000002020548,
                    -0.00000000001255416,
                    -0.00000000003309768,
                    -0.00000000001604484,
                    0.00000000004954332,
                    0.00000000003845412,
                    -1.0008516E-12,
                    -0.00000000002149452,
                    0.000000000011321772,
                    0.00000000004796628,
                    -0.00000000001008444,
                    0.000000000011801856,
                    -0.00000000002420688,
                    -0.00000000001899528,
                    0.00000000004178088,
                    0.00000000005148924,
                    -0.00000000000128526,
                    -0.00000000005581632,
                    -0.00000000006591648,
                    -0.0000000000660036,
                    -0.00000000003990492,
                    -0.00000000001496304,
                    -0.00000000003985152,
                    -0.000000000005049264,
                    -0.000000000009416976,
                    -0.00000000001523028,
                    -0.0000000000203028,
                    -0.000000000007573404,
                    0.00000000008781192,
                    0.00000000007118724,
                    0.00000000005436756,
                    -0.000000000002803284,
                    -0.00000000002029704,
                    0.0000000000329166,
                    -0.00000000002213532,
                    -0.00000000002199684,
                    -0.00000000002676948,
                    0.00000000001689372,
                    0.0000000000410244,
                    0.00000000003653784,
                    4.204428E-13,
                    -0.00000000007927524,
                    -0.0000000000107472,
                    0.000000000007586832,
                    0.00000000000950364,
                    0.000000000004727652,
                    0.00000000000761532,
                    0.00000000005314692,
                    0.00000000003044304,
                    -0.000000000001799676,
                    0.00000000002042484,
                    -0.000000000011748804,
                    5.475204E-13,
                    -0.0000000000315228,
                    -0.00000000001847268,
                    -0.00000000002758296,
                    0.00000000000630588,
                    0.00000000005839968,
                    -0.00000000002768424,
                    -0.00000000006372252,
                    -0.00000000007818408,
                    -0.000000000010511796,
                    0.00000000001756836,
                    -0.000000000011047176,
                    0.0000000000351768,
                    0.00000000003924288,
                    0.0000000000337584,
                    -0.00000000002203788,
                    -0.00000000006878604,
                    0.00000000000734172,
                    0.00000000003557304,
                    0.00000000009703872,
                    0.000000000009836988,
                    -0.00000000006271488,
                    0.00000000000318084,
                    0.00000000003866676,
                    0.00000000003277524,
                    -0.00000000007663968,
                    -0.00000000006227292,
                    -0.00000000002158212,
                    0.00000000003019992,
                    0.00000000007254492,
                    -0.00000000002478612,
                    -0.00000000004362672,
                    -0.00000000007155156,
                    -0.00000000002484108,
                    0.00000000002369124,
                    -0.00000000001772028,
                    0.0000000000184608,
                    0.00000000004960476,
                    0.00000000010959588,
                    0.00000000007278012,
                    -0.000000000008928672,
                    -0.00000000002370132,
                    -0.00000000004298556,
                    0.000000000007689288,
                    0.000000000010670652,
                    -0.00000000002006616,
                    0.000000000006485568,
                    0.00000000002797944,
                    0.00000000003558996,
                    0.000000000011353512,
                    -0.00000000003005784,
                    -0.00000000003099348,
                    -0.0000000000166506,
                    0.00000000001918644,
                    -0.00000000003143112,
                    -0.00000000001850916,
                    -0.0000000000377178,
                    -0.00000000002736288,
                    -0.00000000003452664,
                    -0.00000000002924652,
                    -0.00000000002363664,
                    -0.00000000001878564,
                    0.00000000005335032,
                    0.00000000004247952,
                    0.0000000000096951,
                    0.000000000003978804,
                    6.539328E-13,
                    0.00000000002873952,
                    0.00000000002177616,
                    0.0000000000290598,
                    0.00000000002496768,
                    -0.00000000005243592,
                    -0.00000000007006596,
                    -0.00000000005488728,
                    0.00000000002436324,
                    0.00000000005305932,
                    0.00000000006896304,
                    0.00000000002157936,
                    -0.0000000000369378,
                    0.000000000001618128,
                    -0.000000000003429468,
                    0.000000000006106248,
                    -0.00000000001680516,
                    -0.00000000001454796,
                    0.00000000004545996,
                    0.00000000004619796,
                    0.0000000000299358,
                    0.000000000008090976,
                    -0.00000000000165156,
                    -0.00000000002928696,
                    -0.00000000007009884,
                    -0.0000000000144114,
                    0.00000000000905952,
                    2.148216E-13,
                    0.00000000002828376,
                    -0.00000000002632764,
                    -0.0000000000458904,
                    -0.00000000005075916,
                    0.00000000002065968,
                    -0.00000000000205242,
                    8.593536E-13,
                    -0.000000000001312128,
                    0.00000000003209376,
                    0.00000000006278376,
                    0.000000000003407556,
                    -0.0000000000394044,
                    0.000000000007774392,
                    -0.000000000001366512,
                    0.000000000002521176,
                    0.000000000010959384,
                    0.00000000001780428,
                    -0.0000000000480336,
                    -0.00000000003255816,
                    -0.00000000002565996,
                    -0.00000000005626212,
                    0.000000000004712052,
                    0.00000000004309452,
                    0.00000000006888276,
                    0.00000000004366464,
                    -0.00000000004363824,
                    -0.00000000006120084,
                    -0.000000000005346396,
                    0.00000000008534832,
                    0.00000000008525268,
                    0.000000000001203852,
                    -0.00000000004640556,
                    -0.0000000000436476,
                    0.00000000002654568,
                    -0.00000000001990284,
                    -0.000000000003036552,
                    0.00000000003245856,
                    0.00000000005915352,
                    0.00000000005951364,
                    -0.00000000002785596,
                    -0.00000000005458392,
                    -0.000000000007238688,
                    0.0000000000602304,
                    0.000000000001004604,
                    -0.00000000009127152,
                    -0.00000000005348964,
                    -0.00000000004244604,
                    0.0000000000138954,
                    0.000000000010407756,
                    -0.00000000004930728,
                    -0.00000000005198784,
                    0.000000000011463444,
                    -0.00000000001702824,
                    -0.00000000005987844,
                    -0.000000000003173856,
                    0.00000000002421588,
                    0.00000000005550468,
                    0.00000000008655492,
                    -0.00000000000353844,
                    0.00000000001373184,
                    0.00000000005745828,
                    0.0000000000302316,
                    0.00000000004656936,
                    0.00000000004731144,
                    0.000000000004375896,
                    -0.000000000009780384,
                    0.00000000000350754,
                    -0.000000000009687204,
                    -0.00000000004092096,
                    -0.00000000002371116,
                    -0.0000000000468858,
                    -0.00000000001885476,
                    -0.00000000000408576,
                    -6.914496E-13,
                    -0.00000000001771728,
                    -0.00000000006439032,
                    -0.00000000005148396,
                    0.00000000001895304,
                    0.00000000006177756,
                    0.00000000003848556,
                    -0.00000000001272924,
                    -0.00000000001910928,
                    -0.000000000045282,
                    -0.00000000001667844,
                    0.00000000002508096,
                    0.00000000003943356,
                    0.00000000004741536,
                    -0.000000000006281724,
                    -0.00000000001220112,
                    0.00000000002120712,
                    0.00000000005502828,
                    0.00000000004575084,
                    -0.000000000002205204,
                    -0.0000000000402414,
                    -0.00000000002868912,
                    -0.00000000000576198,
                    -0.00000000002217648,
                    -0.0000000000157002,
                    0.00000000002917464,
                    -0.00000000002109324,
                    -0.00000000003538824,
                    -0.00000000006158256,
                    0.0000000000176622,
                    0.00000000006879048,
                    0.00000000003825384,
                    -0.00000000001914408,
                    -0.0000000000499908,
                    -0.000000000005482824,
                    -0.000000000004897872,
                    -0.000000000002980824,
                    -0.00000000003047028,
                    -0.0000000000606906,
                    0.00000000004582308,
                    0.00000000006928248,
                    0.00000000003190308,
                    -0.0000000000128736,
                    0.000000000006027072,
                    0.0000000000459894,
                    -0.00000000002254068,
                    -0.00000000002462376,
                    -0.000000000002603796,
                    0.00000000002290716,
                    0.0000000000360714,
                    -0.00000000003407592,
                    0.000000000004650276,
                    0.00000000004758564,
                    0.00000000005675388,
                    0.00000000003375384,
                    -0.00000000004653336,
                    -0.00000000005532372,
                    -0.00000000004704,
                    0.00000000001803576,
                    0.0000000000168438,
                    -0.00000000006040164,
                    -0.00000000003650184,
                    -0.00000000002952012,
                    -0.00000000002453208,
                    -0.00000000005102664,
                    0.0000000000227772,
                    0.00000000007147008,
                    0.00000000002927952,
                    0.00000000004472232,
                    -0.00000000004972296,
                    -0.0000000000200208,
                    0.00000000002441556,
                    0.00000000001758012,
                    -0.00000000001381812,
                    -0.00000000004714968,
                    -0.000000000007381008,
                    0.00000000000357036,
                    0.00000000007139064,
                    0.00000000005360652,
                    -0.00000000001576284,
                    0.000000000008502552,
                    -0.00000000003135996,
                    0.000000000008772372,
                    0.000000000004533828,
                    -0.000000000002327112,
                    -0.00000000002617392,
                    -0.000000000008798292,
                    0.0000000000647682,
                    -0.000000000004897152,
                    -0.00000000005749536,
                    -0.00000000002118288,
                    0.00000000003053184,
                    0.00000000005824596,
                    0.00000000002895288,
                    0.00000000003212448,
                    -0.00000000003233808,
                    -0.00000000001393128,
                    0.00000000001665972,
                    -0.00000000004098588,
                    -0.00000000003695328,
                    -0.00000000001628148,
                    0.00000000005682852,
                    0.000000000008571768,
                    -0.00000000009773484,
                    -0.00000000005081004,
                    0.000000000002097948,
                    0.00000000001789872,
                    -0.00000000002914032,
                    -0.00000000004300236,
                    -0.00000000002206164,
                    0.00000000001919616,
                    0.00000000007389288,
                    0.00000000003659916,
                    0.00000000003435012,
                    0.00000000004562436,
                    0.00000000001816356,
                    -0.000000000008912928,
                    -0.00000000005884368,
                    -0.00000000001301412,
                    0.00000000001986348,
                    0.0000000000295698,
                    -0.00000000005011032,
                    -0.00000000005319384,
                    0.00000000002114208,
                    0.0000000000444048,
                    0.00000000006591912,
                    -0.000000000010691304,
                    -0.00000000005613324,
                    -0.0000000000187788,
                    -0.00000000002300652,
                    0.00000000006625344,
                    0.0000000000812352,
                    0.00000000003353016,
                    0.00000000001208316,
                    -0.00000000002475864,
                    -0.00000000003597876,
                    -0.000000000054915,
                    0.00000000005026284,
                    0.0000000000189264,
                    -0.00000000002022168,
                    -0.0000000000428376,
                    -0.0000000001089504,
                    -0.00000000009173112,
                    -0.00000000003161184,
                    0.0000000000258072,
                    0.00000000004364652,
                    0.00000000001733916,
                    0.00000000002769084,
                    0.00000000002346708,
                    0.0000000000232974,
                    -0.00000000006241968,
                    -0.00000000005476836,
                    0.00000000007521996,
                    0.00000000008064864,
                    0.00000000009439116,
                    0.00000000003180528,
                    -0.00000000001474296,
                    -0.00000000003039012,
                    0.00000000001293192,
                    0.00000000002513628,
                    -0.00000000003143388,
                    -7.955868E-13,
                    -0.000000000007488312,
                    -0.00000000001644348,
                    -0.00000000002949996,
                    -0.00000000006025428,
                    -0.000000000006563904,
                    -0.0000000000218292,
                    -0.00000000004491432,
                    -0.000000000011279844,
                    -0.00000000000744174,
                    0.00000000003047796,
                    -0.000000000010053204,
                    0.00000000003843684,
                    0.00000000004752,
                    0.00000000006016164,
                    0.00000000006370332,
                    -0.00000000004267656,
                    -0.00000000007963968,
                    -0.00000000005415168,
                    0.0000000000448704,
                    0.00000000005216316,
                    -0.00000000002329068,
                    -0.00000000001800216,
                    0.00000000002084832,
                    0.00000000002948292,
                    0.00000000000119925,
                    -0.00000000002484168,
                    -0.00000000003971148,
                    -0.0000000000504156,
                    -0.000000000003792516,
                    -0.00000000001863276,
                    0.00000000004081944,
                    0.00000000009515856,
                    0.0000000000771372,
                    0.000000000010151916,
                    -0.00000000009445944,
                    -0.00000000006728712,
                    0.00000000002746176,
                    0.00000000008985288,
                    0.000000000008763564,
                    -0.00000000008930124,
                    -0.00000000004219356,
                    -0.00000000002680404,
                    0.000000000011555616,
                    0.00000000003366156,
                    -0.0000000000254886,
                    -0.000000000032694,
                    0.000000000005222028,
                    0.00000000006286992,
                    0.00000000003118368,
                    -0.0000000000033804,
                    -0.00000000002642544,
                    -0.0000000000235962,
                    0.00000000001066422,
                    0.000000000010010424,
                    0.00000000005333436,
                    0.0000000000568644,
                    -0.00000000001943112,
                    -0.00000000005204316,
                    -0.00000000002349396,
                    -0.00000000001046508,
                    0.00000000000221136,
                    0.0000000000552492,
                    0.00000000003464664,
                    -0.00000000002290992,
                    -0.00000000001488048,
                    -0.00000000006437712,
                    -0.00000000002934816,
                    0.000000000005452848,
                    -0.000000000008712012,
                    -0.0000000000096027,
                    -0.00000000003495528,
                    -0.00000000003864036,
                    -0.00000000004539036,
                    0.00000000002777532,
                    0.00000000006888096,
                    0.00000000008767608,
                    0.00000000008747736,
                    -0.0000000000240378,
                    -0.00000000007372776,
                    -0.00000000001761096,
                    0.00000000002656308,
                    0.000000000010166964,
                    -0.000000000031779,
                    0.00000000004697676,
                    0.0000000000265986,
                    0.00000000004057632,
                    0.00000000004329492,
                    -0.00000000002257008,
                    -0.000000000008442612,
                    0.000000000005577084,
                    0.00000000002695164,
                    -0.00000000004029492,
                    -0.00000000007797636,
                    -0.00000000005397864,
                    0.000000000003549936,
                    0.00000000001965492,
                    -0.00000000006703056,
                    -0.0000000000429156,
                    -0.00000000000363408,
                    -0.00000000000038952,
                    0.00000000003263304,
                    -0.00000000001734516,
                    -2.123808E-13,
                    -3.032208E-13,
                    0.00000000005705808,
                    0.00000000002672928,
                    0.00000000000331272,
                    0.00000000001412028,
                    0.00000000003256776,
                    0.00000000004968288,
                    -0.00000000000462648,
                    -0.00000000002442696,
                    0.00000000002932668,
                    -0.00000000001990884,
                    -0.00000000003643812,
                    -0.00000000005566032,
                    -0.0000000000474522,
                    0.0000000000202662,
                    0.00000000001967232,
                    0.00000000003426444,
                    0.000000000008460936,
                    0.000000000004060584,
                    -0.00000000001225332,
                    0.00000000001917108,
                    0.00000000003413976,
                    0.000000000006522804,
                    -0.00000000000271788,
                    -0.00000000004585884,
                    -0.00000000002891832,
                    0.000000000006148368,
                    0.00000000005143524,
                    0.00000000001222224,
                    -0.0000000000399918,
                    -0.000000000002731656,
                    -0.000000000011258112,
                    -0.000000000006960048,
                    0.00000000005146404,
                    0.00000000001241724,
                    0.00000000002238576,
                    -0.000000000011302344,
                    -0.000000000002788656,
                    -0.00000000006483636,
                    -0.00000000006011964,
                    0.00000000001451784,
                    0.00000000004555752,
                    0.00000000004735248,
                    -0.0000000000087966,
                    -0.00000000003789408,
                    0.000000000000556728,
                    -0.00000000000897354,
                    -0.000000000004699032,
                    -0.00000000001524876,
                    -0.0000000000245592,
                    0.00000000001299888,
                    0.00000000006305316,
                    0.00000000004116024,
                    -0.0000000000571014,
                    -0.0000000001245744,
                    -0.000000000100362,
                    0.00000000001953168,
                    0.00000000004355016,
                    0.00000000003507108,
                    0.00000000003945084,
                    0.00000000004087488,
                    0.00000000004833648,
                    0.00000000003321612,
                    0.000000000004169232,
                    -0.000000000003022872,
                    0.0000000000332466,
                    0.00000000008642292,
                    0.00000000006483,
                    0.00000000004401228,
                    -0.00000000001513716,
                    -0.00000000004118148,
                    -0.00000000002032848,
                    -0.00000000009271248,
                    -0.0000000000814476,
                    -0.00000000004882416,
                    -0.000000000006760308,
                    -0.00000000000309738,
                    -0.00000000004514604,
                    -0.00000000001423776,
                    -0.000000000006598452,
                    0.0000000000296352,
                    0.00000000003196128,
                    -0.00000000003016176,
                    -0.00000000001496496,
                    0.00000000002619312,
                    0.00000000007824588,
                    0.00000000006888276,
                    0.00000000005632632,
                    0.00000000001671912,
                    -0.0000000000701742,
                    -0.0000000000370764,
                    -0.00000000005737008,
                    -0.00000000001251468,
                    -0.000000000010839516,
                    -0.00000000003962496,
                    -0.00000000004400748,
                    -0.00000000006388584,
                    -0.000000000008147052,
                    0.0000000000482412,
                    0.0000000000673626,
                    0.00000000003979824,
                    -0.000000000011891568,
                    0.0000000000140208,
                    0.000000000006899568,
                    0.0000000000697098,
                    0.00000000004029564,
                    0.00000000002317548,
                    0.0000000000146178,
                    -0.00000000005336088,
                    0.00000000002771856,
                    0.00000000001789572,
                    -0.00000000005116176,
                    -0.000000000071271,
                    -0.000000000010567464,
                    0.000000000058434,
                    0.00000000001610532,
                    -0.000000000011885916,
                    -0.000000000007079088,
                    0.00000000002594676,
                    0.00000000004853592,
                    -0.00000000004806396,
                    -0.0000000000695004,
                    -0.0000000000610644,
                    0.0000000000149826,
                    0.00000000006094512,
                    0.00000000003903228,
                    0.000000000007045584,
                    -0.0000000000436536,
                    -0.0000000000256392,
                    0.000000000003298248,
                    0.00000000002105832,
                    0.00000000004448856,
                    0.00000000001901952,
                    -0.00000000003934392,
                    -0.00000000008502564,
                    -0.00000000007131456,
                    -0.0000000000657342,
                    -0.000000000008572728,
                    0.0000000000591564,
                    0.0000000000470082,
                    0.00000000005330172,
                    0.00000000000132012,
                    -0.00000000002084388,
                    -0.00000000002058072,
                    -0.0000000000258954,
                    0.00000000007227888,
                    0.00000000006789564,
                    0.000000000009121392,
                    -0.00000000005976792,
                    0.00000000000160926,
                    0.00000000003652188,
                    0.0000000000175122,
                    0.00000000002665932,
                    0.00000000003422532,
                    0.00000000002754144,
                    -0.00000000001236216,
                    -0.00000000007409724,
                    -0.00000000004836384,
                    -0.00000000003392844,
                    0.00000000001758168,
                    0.00000000000862302,
                    0.00000000002222436,
                    0.00000000003370416,
                    0.00000000001664844,
                    0.00000000002445312,
                    -0.00000000003602652,
                    -0.00000000005059068,
                    -0.000000000011221116,
                    0.0000000000348516,
                    0.00000000003401964,
                    -0.000000000008182452,
                    0.00000000003595836,
                    0.00000000001642584,
                    -0.00000000006109764,
                    -0.00000000006742812,
                    -0.0000000000653772,
                    -0.0000000000302346,
                    0.0000000000015219,
                    0.0000000000187818,
                    0.00000000002346288,
                    0.000000000003781512,
                    -7.265808E-13,
                    -0.00000000006381948,
                    -0.00000000001485552,
                    0.00000000001985868,
                    0.00000000005575404,
                    0.00000000006969156,
                    0.000000000004246608,
                    0.00000000004180668,
                    0.0000000000193536,
                    -0.00000000004273404,
                    -0.000000000011220852,
                    0.0000000000146292,
                    0.000000000011265528,
                    -0.00000000003994908,
                    -0.000000000006313536,
                    0.00000000002205372,
                    0.00000000004071876,
                    0.00000000005801736,
                    -0.00000000004120008,
                    -0.00000000005693076,
                    -0.00000000006266676,
                    0.0000000000950772,
                    0.0000000001215864,
                    -3.707796E-13,
                    -0.00000000005937504,
                    -0.00000000001936536,
                    0.0000000000241422,
                    -0.00000000003567036,
                    -0.00000000004054416,
                    -0.00000000001982712,
                    -0.000000000010413444,
                    0.00000000006110688,
                    -0.00000000001587336,
                    -0.00000000006410664,
                    -0.00000000005538216,
                    -0.0000000000158874,
                    0.00000000001427376,
                    -0.00000000003823656,
                    0.000000000007781424,
                    -0.00000000001976532,
                    0.00000000001900356,
                    0.00000000004947552,
                    0.000000000002288256,
                    0.0000000000181956,
                    0.0000000000214548,
                    0.000000000005655144,
                    0.00000000002059452,
                    0.00000000002948004,
                    0.000000000002659536,
                    -0.00000000003865068,
                    -0.0000000000016686,
                    -0.0000000000219204,
                    0.00000000002810868,
                    0.00000000003156,
                    0.00000000002398668,
                    0.00000000003526644,
                    0.00000000001092894,
                    0.00000000002859888,
                    -0.00000000004231764,
                    -0.00000000006401316,
                    -0.00000000001615584,
                    0.00000000001768632,
                    0.00000000005364972,
                    -0.00000000002643948,
                    -0.00000000005493984,
                    -0.00000000003991764,
                    -0.000000000011953092,
                    -0.00000000001236828,
                    -0.00000000001700916,
                    0.00000000004282452,
                    -0.00000000002292636,
                    -0.000000000007339644,
                    0.000000000067962,
                    0.0000000000411318,
                    0.00000000002994504,
                    0.00000000002920236,
                    0.00000000000690864,
                    -0.00000000006280956,
                    -0.0000000000124968,
                    -0.0000000000135408,
                    -0.00000000004256244,
                    -0.00000000006376272,
                    -0.00000000004072896,
                    0.000000000045828,
                    0.0000000000694566,
                    0.00000000001524552,
                    0.00000000002178408,
                    0.000000000010351452,
                    0.000000000011212596,
                    -0.00000000005840484,
                    -0.0000000000237228,
                    0.000000000043533,
                    0.0000000000321882,
                    0.0000000000449094,
                    -0.00000000001661928,
                    -0.00000000004853472,
                    -0.00000000005635536,
                    -0.000000000006632736,
                    0.00000000002746572,
                    0.0000000000163164,
                    0.00000000003886416,
                    -0.00000000002342484,
                    -0.000000000053442,
                    -0.000000000003099816,
                    -0.00000000001716096,
                    0.000000000002358192,
                    -0.000000000009239964,
                    -0.00000000001117548,
                    -0.00000000002685492,
                    0.000000000036924,
                    0.00000000008957328,
                    0.00000000004589088,
                    0.00000000002882376,
                    -0.000000000031551,
                    0.00000000002739372,
                    0.00000000002472972,
                    -0.0000000000394086,
                    -0.000000000035244,
                    0.000000000011481408,
                    0.00000000006542784,
                    0.00000000002979696,
                    -0.000000000011372808,
                    -0.00000000002728236,
                    -0.00000000008631348,
                    -0.00000000005909904,
                    -0.000000000001319952,
                    0.0000000000459126,
                    0.000000000007881552,
                    -0.00000000003441132,
                    -0.00000000004600824,
                    -0.00000000005918868,
                    -0.00000000001239348,
                    -0.0000000000140022,
                    0.00000000008059752,
                    0.00000000011708244,
                    0.00000000001932672,
                    -0.00000000004054848,
                    -0.00000000009691944,
                    -0.00000000008548608,
                    -0.000000000010939032,
                    0.0000000000684852,
                    0.0000000000671946,
                    -0.0000000000132102,
                    -0.000000000010269228,
                    0.000000000006075648,
                    0.00000000006689496,
                    0.00000000001179324,
                    0.000000000005974764,
                    0.00000000007466016,
                    0.0000000000411564,
                    0.000000000009383712,
                    -0.0000000000327054,
                    -0.0000000000081054,
                    0.00000000003810744,
                    0.00000000002134476,
                    -0.00000000003003516,
                    -0.0000000000655284,
                    -0.0000000000224556,
                    -0.0000000000332802,
                    -0.0000000000622482,
                    -0.00000000001952376,
                    0.000000000009777768,
                    0.00000000005906088,
                    -0.00000000002726688,
                    -0.0000000000201264,
                    0.00000000000764346,
                    -0.00000000002269764,
                    -0.00000000002082156,
                    -0.000000000010855932,
                    0.00000000002669964,
                    -0.00000000003030204,
                    0.000000000002482728,
                    0.00000000001956672,
                    -0.0000000000539424,
                    -0.00000000006134124,
                    0.00000000003383052,
                    0.00000000011402184,
                    0.0000000000619806,
                    -0.00000000001445124,
                    -0.00000000001251864,
                    0.000000000011235936,
                    0.00000000003915924,
                    -0.00000000004492884,
                    0.00000000001825404,
                    0.00000000004916268,
                    -0.000000000008191872,
                    0.000000000001648344,
                    0.000000000004690656,
                    0.00000000001733232,
                    -0.00000000005270748,
                    -0.00000000003660528,
                    0.000000000010772004,
                    0.000000000007941336,
                    0.00000000001361748,
                    -0.00000000003215616,
                    0.00000000001470024,
                    0.00000000004968024,
                    -0.00000000002651052,
                    -0.00000000001571232,
                    -0.00000000003330108,
                    0.000000000017376,
                    -0.00000000002842092,
                    -0.00000000003658512,
                    0.00000000002187384,
                    0.000000000003887952,
                    -0.00000000002538828,
                    -0.00000000001840968,
                    0.00000000004697808,
                    0.00000000003837648,
                    -0.00000000003844548,
                    -0.00000000003762408,
                    0.00000000004108308,
                    0.0000000000766446,
                    -0.00000000001236696,
                    -0.00000000002102016,
                    0.00000000004045608,
                    -0.000000000008972388,
                    -0.00000000004567452,
                    -0.00000000002622996,
                    0.00000000004660128,
                    0.000000000004911708,
                    -0.00000000003835632,
                    0.00000000002201796,
                    0.00000000003058932,
                    -0.00000000006140316,
                    -0.0000000001276044,
                    0.000000000010142268,
                    0.00000000005933676,
                    -0.000000000001725996,
                    -0.00000000000751986,
                    0.00000000001312428,
                    0.00000000004294368,
                    -0.00000000001319592,
                    -0.00000000006166224,
                    0.000000000007008156,
                    -0.00000000001664796,
                    -0.000000000002947896,
                    0.00000000004403292,
                    0.0000000001256976,
                    0.00000000009421092,
                    0.000000000010432548,
                    0.00000000002571636,
                    0.0000000000581502,
                    0.00000000007206612,
                    -0.00000000003951348,
                    -0.00000000004687848,
                    0.00000000001597476,
                    -0.00000000002418408,
                    -0.00000000011374152,
                    -0.00000000012816,
                    -0.0000000000432372,
                    -0.000000000003179352,
                    -0.00000000002829072,
                    -0.00000000002079,
                    -0.00000000002968392,
                    -0.00000000003117204,
                    -0.00000000008423244,
                    0.00000000002923524,
                    0.00000000009109188,
                    0.000000000006865572,
                    -0.00000000002628708,
                    0.000000000003735444,
                    0.000000000100674,
                    0.00000000002798736,
                    -0.000000000003800196,
                    0.00000000005293692,
                    0.000000000012624,
                    -0.0000000000591186,
                    -0.00000000006137964,
                    0.00000000005474844,
                    0.0000000001003302,
                    -0.000000000004343244,
                    -0.00000000002780328,
                    0.0000000000220524,
                    0.00000000005536272,
                    -0.00000000003894336,
                    -0.00000000003015276,
                    0.0000000000426294,
                    -0.00000000002250924,
                    -0.0000000000176508,
                    0.0000000000410532,
                    0.0000000000712926,
                    -0.00000000002713248,
                    -0.00000000005940816,
                    0.00000000000066252,
                    0.00000000002171208,
                    -0.00000000000301164,
                    -0.00000000008144472,
                    -0.0000000000131964,
                    0.00000000001507524,
                    -0.00000000002590608,
                    -0.00000000002281488,
                    -0.00000000004671552,
                    -0.00000000001294848,
                    -0.000000000009611688,
                    0.00000000000246294,
                    0.00000000002332908,
                    0.00000000001606968,
                    -0.00000000000842556,
                    -0.00000000002929032,
                    0.0000000000570198,
                    0.00000000004164312,
                    -0.0000000000207396,
                    -0.00000000004636644,
                    0.000000000010412676,
                    0.00000000004459116,
                    -0.00000000006927408,
                    -0.00000000005651256,
                    0.00000000005576304,
                    0.00000000004373628,
                    -0.00000000001165014,
                    -0.000000000002275596,
                    0.00000000010808172,
                    0.00000000009077496,
                    0.000000000005972028,
                    0.00000000003450432,
                    0.00000000004350072,
                    -0.000000000003617616,
                    -0.0000000000775986,
                    -0.00000000004774812,
                    -0.00000000003378768,
                    -0.00000000008816448,
                    -0.00000000009690792,
                    0.00000000002307084,
                    0.00000000007144824,
                    -0.000000000006013752,
                    -0.00000000003726732,
                    0.0000000000180192,
                    0.00000000001241196,
                    -0.00000000003152544,
                    0.000000000009973152,
                    0.00000000007903236,
                    0.0000000000684594,
                    -0.00000000000487914,
                    -0.00000000004155624,
                    -0.00000000003990084,
                    0.00000000001811004,
                    -0.00000000006447492,
                    8.300808E-13,
                    0.00000000005257536,
                    0.0000000000526092,
                    -0.00000000003268308,
                    -0.00000000004770084,
                    0.00000000004691352,
                    0.000000000010150464,
                    -0.00000000007599444,
                    -0.00000000006705276,
                    -4.793568E-13,
                    0.00000000002477484,
                    -0.00000000002485032,
                    0.00000000003285144,
                    0.00000000007659264,
                    0.00000000001551192,
                    -0.0000000000368646,
                    -0.000000000004718808,
                    0.00000000011222244,
                    0.00000000003319836,
                    -0.00000000004481568,
                    -0.00000000002251404,
                    -0.00000000002532972,
                    -0.0000000000409974,
                    -0.0000000000442518,
                    0.00000000002250252,
                    0.00000000004710108,
                    -0.00000000002353164,
                    -0.00000000003521508,
                    0.00000000004503252,
                    0.00000000003897252,
                    -0.0000000000658122,
                    -0.00000000001229928,
                    0.00000000006888756,
                    0.000000000006943212,
                    -0.0000000000559848,
                    -0.00000000004603044,
                    0.0000000000590154,
                    0.00000000006122856,
                    0.000000000008752548,
                    -0.000000000001579632,
                    0.00000000004887348,
                    0.000000000011366652,
                    -0.00000000007869372,
                    -0.000000000008714364,
                    0.000000000001684836,
                    0.0000000000182874,
                    -0.000000000031161,
                    -0.00000000006902772,
                    -0.000000000006371748,
                    -0.00000000004725672,
                    -0.00000000005106924,
                    0.00000000002844636,
                    0.00000000003685224,
                    0.000000000009513072,
                    -0.0000000000209028,
                    0.00000000005862852,
                    0.00000000007322676,
                    -0.00000000001861176,
                    -0.00000000005953308,
                    0.00000000002308092,
                    0.00000000008325468,
                    -0.00000000004275696,
                    -0.00000000004692408,
                    0.0000000000368508,
                    0.00000000004795056,
                    0.000000000002546652,
                    -0.00000000000366672,
                    0.00000000002828316,
                    -0.00000000002733756,
                    -0.0000000000425166,
                    -0.00000000001286484,
                    0.00000000004011396,
                    0.0000000000204774,
                    -0.00000000005391372,
                    -0.00000000002217084,
                    0.00000000004673724,
                    0.00000000004829724,
                    -0.00000000004335312,
                    -0.00000000005108964,
                    0.00000000001972572,
                    -0.00000000002202828,
                    -0.00000000003642048,
                    -0.00000000000290922,
                    -0.00000000001770612,
                    0.000000000007842576,
                    0.000000000003752736,
                    0.00000000002913012,
                    0.00000000004117584,
                    0.00000000005942268,
                    0.00000000001812708,
                    0.00000000001377348,
                    -0.00000000001239072,
                    -0.0000000000922008,
                    -0.0000000000524274,
                    0.00000000003746652,
                    0.00000000003661308,
                    -0.0000000000683814,
                    -0.0000000000747528,
                    0.0000000000445992,
                    0.00000000008176464,
                    0.00000000003957996,
                    -0.0000000000143604,
                    0.00000000002842908,
                    0.00000000007154016,
                    -0.0000000000383652,
                    -0.00000000007336632,
                    -0.00000000002838012,
                    -0.00000000001569156,
                    -0.00000000002568864,
                    0.00000000002553636,
                    0.00000000007770456,
                    -0.0000000000386568,
                    -0.00000000006785676,
                    -0.00000000004036212,
                    0.00000000001832412,
                    0.00000000009952116,
                    0.00000000007080228,
                    0.00000000004553256,
                    -0.00000000001542072,
                    -0.00000000005639664,
                    -0.00000000002550312,
                    0.00000000004095276,
                    0.0000000000492924,
                    -0.00000000003843252,
                    -0.0000000000502188,
                    -0.00000000002787312,
                    -0.00000000007548504,
                    -0.00000000010116,
                    -0.00000000005027748,
                    0.00000000006016236,
                    0.0000000001390152,
                    0.0000000001320624,
                    0.00000000004132464,
                    -0.00000000007647276,
                    -0.00000000008961708,
                    -0.00000000009148236,
                    -0.00000000003198816,
                    0.00000000008893152,
                    0.00000000008857044,
                    -0.000000000003719304,
                    -0.00000000002449776,
                    0.00000000001878588,
                    -7.933176E-13,
                    0.0000000000025332,
                    -0.00000000002701104,
                    -0.00000000005662236,
                    -0.00000000002734944,
                    -0.0000000000250992,
                    0.00000000002091312,
                    0.00000000006108648,
                    0.00000000007055076,
                    -0.00000000002716092,
                    -0.00000000005025072,
                    0.000000000022602,
                    -0.000000000001496712,
                    0.00000000001561236,
                    0.000000000079266,
                    0.00000000003730488,
                    -0.0000000000325362,
                    -0.00000000006011604,
                    0.00000000003068724,
                    0.00000000001767348,
                    -0.00000000001919616,
                    0.0000000000321108,
                    0.0000000000499584,
                    0.00000000003134928,
                    -0.00000000006557328,
                    -0.0000000000801018,
                    -0.0000000000557154,
                    -0.0000000000441252,
                    -0.00000000008192184,
                    0.000000000004140264,
                    0.00000000003025212,
                    0.00000000001554768,
                    0.00000000002931636,
                    -0.00000000002628036,
                    -0.00000000003954912,
                    0.0000000000278646,
                    0.00000000003351348,
                    0.0000000000192936,
                    -0.00000000001204608,
                    0.00000000001934376,
                    0.0000000000140496,
                    0.000000000047406,
                    0.00000000007947564,
                    0.000000000003220788,
                    -0.00000000000614502,
                    -0.00000000004594716,
                    0.000000000010824504,
                    -0.000000000002715396,
                    -0.00000000000400632,
                    0.0000000000278958,
                    0.000000000002109552,
                    -0.00000000005171088,
                    -0.000000000020907,
                    0.00000000001991436,
                    0.00000000006793176,
                    0.00000000002408928,
                    -0.00000000004374804,
                    -0.00000000005194236,
                    -0.0000000000401526,
                    -0.00000000001382556,
                    -1.0042692E-12,
                    0.00000000005738124,
                    -0.00000000001531668,
                    -0.00000000003955944,
                    -0.00000000003709116,
                    0.00000000005985588,
                    0.00000000004446336,
                    0.00000000003269304,
                    0.00000000004642452,
                    -0.0000000000309966,
                    -0.00000000004372464,
                    -0.00000000005592036,
                    -0.00000000002876448,
                    -0.00000000001415208,
                    0.00000000004184676,
                    0.00000000003466716,
                    0.00000000001520616,
                    -0.000000000004546896,
                    -0.00000000001768944,
                    -0.00000000002982708,
                    -0.00000000002006304,
                    -0.00000000008387328,
                    3.246636E-13,
                    0.00000000002771016,
                    0.000000000007711668,
                    0.0000000000234252,
                    0.00000000000153294,
                    -0.000000000005357292,
                    0.00000000002326716,
                    0.00000000008365848,
                    0.00000000003482292,
                    0.00000000001474944,
                    0.00000000002394312,
                    0.00000000002103744,
                    -0.00000000005714616,
                    -0.00000000004365324,
                    -0.000000000005090376,
                    0.00000000002625372,
                    0.0000000000241788,
                    0.000000000007824096,
                    -0.0000000000166548,
                    0.00000000002336472,
                    0.000000000002175336,
                    -0.00000000004336668,
                    -0.000000000001341396,
                    0.000000000006175416,
                    0.000000000008227908,
                    0.000000000006167808,
                    -0.000000000005878884,
                    -0.00000000004109736,
                    0.00000000001911516,
                    0.00000000001775304,
                    -0.000000000009246324,
                    0.000000000008975496,
                    -0.00000000002837688,
                    -0.00000000004904448,
                    -0.00000000004631688,
                    -0.00000000004175628,
                    -0.00000000002751168,
                    -0.00000000001866528,
                    0.000000000008076276,
                    -0.000000000011101956,
                    0.00000000001354944,
                    0.0000000000244368,
                    0.00000000005378736,
                    0.00000000006156636,
                    0.000000000001553844,
                    0.00000000001600044,
                    0.00000000001780656,
                    0.00000000002566704,
                    0.000000000011323392,
                    -0.00000000006796116,
                    -0.000000000005862996,
                    0.00000000000989412,
                    -0.00000000002363976,
                    0.00000000002054724,
                    0.00000000004916028,
                    0.00000000003227964,
                    0.00000000001647144,
                    -0.000000000005048388,
                    -0.0000000000200466,
                    -0.000000000010921236,
                    0.000000000008188752,
                    0.000000000002000712,
                    0.00000000002950992,
                    0.00000000002378976,
                    -0.000000000006531408,
                    -0.000000000003040224,
                    -0.00000000003439812,
                    -0.00000000003328524,
                    -0.00000000004237872,
                    0.000000000010281,
                    0.00000000001205352,
                    -0.00000000004242852,
                    -0.00000000007545132,
                    -0.00000000002645856,
                    -0.000000000006923064,
                    0.00000000003309972,
                    0.000000000076818,
                    0.00000000001379316,
                    -0.00000000005176296,
                    -0.00000000006100248,
                    -0.00000000006513756,
                    0.00000000002604084,
                    0.00000000011194884,
                    0.00000000005361228,
                    -0.000000000010772016,
                    -0.00000000001460928,
                    -0.00000000002098776,
                    -0.00000000005402112,
                    -0.00000000002528784,
                    0.00000000002719404,
                    0.00000000009050352,
                    0.00000000006346644,
                    -0.00000000002451504,
                    -0.00000000000601422,
                    0.00000000002501244,
                    0.000000000060384,
                    0.00000000003115668,
                    -0.000000000000331278,
                    0.000000000004098192,
                    -0.0000000000389472,
                    -0.00000000004818192,
                    -0.000000000004272264,
                    0.000000000014523,
                    -0.000000000007055148,
                    -0.000000000006935148,
                    -0.000000000010521804,
                    -0.00000000003303264,
                    -0.0000000000551808,
                    -0.00000000004032   ];
micCalFile.splice(0, 8192, ...micCalData);
micCalData.length = 0;
const resonEar = [1.89004809371761,
                  1.90914347388995,
                  1.92836506884015,
                  1.94771302965891,
                  1.96718712914041,
                  1.98678747607965,
                  2.0065136798223,
                  2.02636580292656,
                  2.04634370447145,
                  2.06644697938287,
                  2.08667543417205,
                  2.10702890699259,
                  2.12750678964354,
                  2.14810886084288,
                  2.16883468895714,
                  2.18968380955813,
                  2.2106557241318,
                  2.23174977954282,
                  2.25296552430069,
                  2.27430223032423,
                  2.29575912992434,
                  2.3173355335391,
                  2.33903064940636,
                  2.36084358200997,
                  2.38277339008956,
                  2.40481911480561,
                  2.42697971845449,
                  2.44925408274375,
                  2.47164100702216,
                  2.4941393256726,
                  2.51674769763179,
                  2.53946472368704,
                  2.56228900411836,
                  2.58521898767335,
                  2.60825307380962,
                  2.63138961057543,
                  2.65462680302878,
                  2.67796284511764,
                  2.70139580563368,
                  2.7249236593936,
                  2.74854430066495,
                  2.7722558194746,
                  2.79605782226174,
                  2.8199500653919,
                  2.84393240166542,
                  2.86800513364032,
                  2.89216789467275,
                  2.91642078197025,
                  2.94076344836864,
                  2.96519601322113,
                  2.98971837984872,
                  3.01433047232232,
                  3.03903197849533,
                  3.06382331436364,
                  3.08870395566171,
                  3.113674114569,
                  3.13873377088063,
                  3.16388221706472,
                  3.18912017045273,
                  3.2144474238128,
                  3.23986331356691,
                  3.26536861129134,
                  3.29096268062346,
                  3.31664561766621,
                  3.3424175364099,
                  3.36827833432352,
                  3.39422780451695,
                  3.42026599854494,
                  3.44639322713989,
                  3.4726089917964,
                  3.49891364339163,
                  3.52530708393498,
                  3.55178911652274,
                  3.57836016271184,
                  3.60501983708193,
                  3.63176849246316,
                  3.65860603116723,
                  3.68553262122804,
                  3.71254833835474,
                  3.7396530474476,
                  3.76684724156278,
                  3.79413084367651,
                  3.82150393015401,
                  3.84896684614593,
                  3.87651949288355,
                  3.90416240326122,
                  3.93189542726997,
                  3.95971916784675,
                  3.98763366948249,
                  4.01563925186114,
                  4.04373609330975,
                  4.07192477709562,
                  4.10020544326708,
                  4.12857851803998,
                  4.15704453226519,
                  4.18560375988098,
                  4.2142567659218,
                  4.24300398032755,
                  4.27184606646567,
                  4.30078343451922,
                  4.3298167327611,
                  4.35894666019232,
                  4.38817385488215,
                  4.41749904164221,
                  4.44692297324817,
                  4.47644643705354,
                  4.5060703107752,
                  4.53579551050746,
                  4.56562292513553,
                  4.59555359844769,
                  4.62558856108025,
                  4.65572882086808,
                  4.6859738451971,
                  4.71631716212909,
                  4.74675325592182,
                  4.77727447080047,
                  4.80787384605493,
                  4.8385436795234,
                  4.86927649629962,
                  4.90006452159692,
                  4.93089899785043,
                  4.96177110677282,
                  4.99267196215865,
                  5.02359237189326,
                  5.05452210322412,
                  5.08545130729629,
                  5.11636979405928,
                  5.14726654678266,
                  5.17812970909299,
                  5.20894824331161,
                  5.23970977318214,
                  5.27040200562485,
                  5.30101176252686,
                  5.331525447671,
                  5.36192951006551,
                  5.39220947844918,
                  5.42235018547228,
                  5.45233671202187,
                  5.48215293763048,
                  5.51178224512372,
                  5.54120798530642,
                  5.57041238370048,
                  5.59937736597655,
                  5.62808406183145,
                  5.65651326776907,
                  5.6846450747856,
                  5.71245896895468,
                  5.73993333607589,
                  5.76704640327477,
                  5.79377562147154,
                  5.82009746820225,
                  5.84598790805802,
                  5.87142207416821,
                  5.8963743082308,
                  5.92081826051542,
                  5.94472668974223,
                  5.96807147227937,
                  5.99082369563008,
                  6.01295396996604,
                  6.03443804847513,
                  6.05525785947806,
                  6.07539229682481,
                  6.09482134050409,
                  6.11352557463796,
                  6.13148382609443,
                  6.14867360309234,
                  6.16507442948006,
                  6.18066308082071,
                  6.19541761767123,
                  6.20931428067362,
                  6.22232915001656,
                  6.23443837402463,
                  6.24561696938443,
                  6.25583976255538,
                  6.26508090670238,
                  6.27331398649561,
                  6.28051225139627,
                  6.28664800100235,
                  6.29169330150013,
                  6.29561936511218,
                  6.29839702786083,
                  6.29999640863054,
                  6.30039939760033,
                  6.29963693069266,
                  6.29775532895564,
                  6.29480382666073,
                  6.29083408141246,
                  6.28590024112282,
                  6.28005996565534,
                  6.27337455642608,
                  6.26590714482017,
                  6.25772467798235,
                  6.24889781235137,
                  6.2395005232625,
                  6.22961022722473,
                  6.21930788647458,
                  6.20867860926577,
                  6.19781128555963,
                  6.18679894686516,
                  6.17573890060524,
                  6.16473212967034,
                  6.1538847450018,
                  6.14330728601438,
                  6.13311473622471,
                  6.12342726336578,
                  6.11436970744357,
                  6.1060722586479,
                  6.09867023200664,
                  6.09227263573647,
                  6.08691754681521,
                  6.08263611858242,
                  6.07945677015852,
                  6.07741204957152,
                  6.07653243133781,
                  6.07685087969759,
                  6.07840040171144,
                  6.08121462771824,
                  6.08532804440952,
                  6.09077647080129,
                  6.09759555254344,
                  6.10582278132856,
                  6.11549509253517,
                  6.12665221961817,
                  6.13933288258412,
                  6.15357769110904,
                  6.16942773144117,
                  6.18692554396767,
                  6.20611392664035,
                  6.22703765203687,
                  6.24974084654542,
                  6.27427036179963,
                  6.30067340555622,
                  6.32899710035392,
                  6.35929204622373,
                  6.39160786699082,
                  6.42599558746789,
                  6.46250883042639,
                  6.5012005589532,
                  6.54212614534819,
                  6.58534152767413,
                  6.6309039361371,
                  6.67887238389853,
                  6.7293067615753,
                  6.78226823870146,
                  6.83781960060369,
                  6.89602483679714,
                  6.95694917302459,
                  7.02065973662805,
                  7.0872247670203,
                  7.1567140653172,
                  7.22919907895532,
                  7.30475279367863,
                  7.38344970418142,
                  7.46536599497263,
                  7.550576585553,
                  7.63911848527645,
                  7.73099382222532,
                  7.82620198452196,
                  7.92474275656456,
                  8.02661306421741,
                  8.13180694670669,
                  8.24031802932131,
                  8.3521372828953,
                  8.46725329648944,
                  8.58565327235216,
                  8.70732116774451,
                  8.83223963520383,
                  8.96038904895153,
                  9.09174522025506,
                  9.22628350542046,
                  9.36397667661527,
                  9.50479272481479,
                  9.64869880999745,
                  9.79565828135552,
                  9.94563184622302,
                  10.0985756987554,
                  10.2544442299438,
                  10.4131880083976,
                  10.5747536646057,
                  10.7390852009176,
                  10.9061215233588,
                  11.0757983904511,
                  11.2480476278697,
                  11.4227969788817,
                  11.5999695114802,
                  11.7794839419063,
                  11.961254700547,
                  12.1451915912976,
                  12.3311992052282,
                  12.5191773336107,
                  12.7090204761634,
                  12.900617934972,
                  13.0938537884653,
                  13.2886057357446,
                  13.484746315047,
                  13.6821417375477,
                  13.8806521254184,
                  14.0801309494264,
                  14.2804255824982,
                  14.4813761777237,
                  14.6828160461455,
                  14.8845712767426,
                  15.0864606342208,
                  15.2882953348108,
                  15.489886837113,
                  15.691059294872,
                  15.8916351106332,
                  16.0914241466594,
                  16.2902356328851,
                  16.4878638733465,
                  16.6841021569225,
                  16.8787321609937,
                  17.0715274879321,
                  17.262254377604,
                  17.4506686459416,
                  17.636519189666,
                  17.8195458872564,
                  17.9994745380881,
                  18.1760289963182,
                  18.3489151620752,
                  18.5178335805122,
                  18.6824729562804,
                  18.8425108038732,
                  18.9976136269771,
                  19.1474356500922,
                  19.2916213814635,
                  19.4298000030823,
                  19.5615915215343,
                  19.6866011457781,
                  19.8044206056164,
                  19.9146294874826,
                  20.016792937301,
                  20.110460859301,
                  20.1951697270628,
                  20.2704418392956,
                  20.3359914956493,
                  20.3918889936323,
                  20.4382525362692,
                  20.4752100022097,
                  20.5029022659238,
                  20.521481666724,
                  20.5311119507148,
                  20.5319696488246,
                  20.5242447434168,
                  20.508139762376,
                  20.4838825289244,
                  20.4518523944409,
                  20.412555848152,
                  20.3665258612356,
                  20.3143205318692,
                  20.2565315375125,
                  20.193776485627,
                  20.1267017290193,
                  20.0559871341383,
                  19.9823451339819,
                  19.9065188870148,
                  19.8292870894434,
                  19.7514636227676,
                  19.6738975422938,
                  19.5974750175443,
                  19.5229476089295,
                  19.4504342471635,
                  19.3799195566471,
                  19.311383951217,
                  19.2448019704449,
                  19.180149891845,
                  19.1173979198603,
                  19.0565157076366,
                  18.9974696154675,
                  18.9402264000038,
                  18.8847434002009,
                  18.8309820698519,
                  18.7788981202677,
                  18.7284415145612,
                  18.6795649589695,
                  18.6322103724138,
                  18.5863231955438,
                  18.5418416773211,
                  18.498700645769,
                  18.4568332623823,
                  18.4161661421447,
                  18.3766240073769,
                  18.3381257308633,
                  18.3005870760087,
                  18.2639200495007,
                  18.228029513213,
                  18.1928181545873,
                  18.1581836040577,
                  18.1240168021014,
                  18.0902051369252,
                  18.0566309415329,
                  18.0231689128292,
                  17.989691141023,
                  17.9560613079927,
                  17.922138695131,
                  17.8877757354991,
                  17.852818674705,
                  17.817107338074,
                  17.7804746192633,
                  17.7427468131021,
                  17.7037992656172,
                  17.6636241409655,
                  17.6222424691773,
                  17.5796663566014,
                  17.535915080655,
                  17.491007636974,
                  17.444963639327,
                  17.3978053445532,
                  17.3495557678256,
                  17.300240638793,
                  17.2498846641324,
                  17.1985182221537,
                  17.1461717331673,
                  17.0928747451685,
                  17.0386626708335,
                  16.983568265845,
                  16.9276312312955,
                  16.8708911261431,
                  16.8133888589938,
                  16.7551681893136,
                  16.6962748406925,
                  16.6367575374089,
                  16.5766656710589,
                  16.51605369486,
                  16.4549764124913,
                  16.3934919186582,
                  16.331660980535,
                  16.269547585853,
                  16.2072174752957,
                  16.1447403296783,
                  16.0821874919938,
                  16.019567929412,
                  15.9567727362116,
                  15.8936776467899,
                  15.8301511906409,
                  15.7660554752851,
                  15.7012498369318,
                  15.6355849350312,
                  15.5689073437376,
                  15.5010536420998,
                  15.4318578601945,
                  15.3611436446583,
                  15.2887316954741,
                  15.214431927446,
                  15.1380485054027,
                  15.0593777198311,
                  14.9782072904833,
                  14.8943180413183,
                  14.8074822410831,
                  14.7174624075869,
                  14.6240139217202,
                  14.5268812037078,
                  14.4258012605692,
                  14.3205002122003,
                  14.2106950362798,
                  14.0960919537718,
                  13.9764698239749,
                  13.8519036633379,
                  13.7225430270906,
                  13.5885468750583,
                  13.4500819487909,
                  13.3073296875915,
                  13.1604761971715,
                  13.0097200936679,
                  12.8552719388179,
                  12.6973507563221,
                  12.5361896310741,
                  12.3720303518277,
                  12.2051314301884,
                  12.0357589169826,
                  11.8641954078114,
                  11.6907354295009,
                  11.5156872884378,
                  11.3393734866751,
                  11.1621311731312,
                  10.9843130714093,
                  10.8062867562988,
                  10.6284104814634,
                  10.4507739611404,
                  10.2732931624364,
                  10.0958774137182,
                  9.91843082295932,
                  9.74085490188347,
                  9.56304455243352,
                  9.38489089991748,
                  9.2062791199873,
                  9.0270893139271,
                  8.84719581219706,
                  8.66646947364976,
                  8.48477313132469,
                  8.30196529896808,
                  8.11789661173958,
                  7.93241254111541,
                  7.74535413477721,
                  7.55655211031278,
                  7.36583237608936,
                  7.17301344719893,
                  6.97790670616255,
                  6.78031667736289,
                  6.58003888595224,
                  6.37686131077072,
                  6.17056463218227,
                  5.96092077655268,
                  5.74769271414048,
                  5.53063442432105,
                  5.30949110336905,
                  5.08399880145158,
                  4.85388332561957,
                  4.61886099859055,
                  4.37863753250893,
                  4.13290846272145,
                  3.88135826607404,
                  3.62442314691577,
                  3.36703769204034,
                  3.11598268969703,
                  2.87833641631557,
                  2.66148303812508,
                  2.47312051803233,
                  2.3212703096658,
                  2.21421879084249,
                  2.1576984982953,
                  2.15375150719639,
                  2.20420351695356,
                  2.31092902265259,
                  2.47585226987981,
                  2.70094950554599,
                  2.98822936018399,
                  3.33797584474784,
                  3.74727351387522,
                  4.21271740669846,
                  4.73071843719335,
                  5.29750006366177,
                  5.90909034273653,
                  6.56131730385257,
                  7.24980134484147,
                  7.96994971304321,
                  8.71694900405349,
                  9.4857589387395,
                  10.271104919482,
                  11.0674709476707];
// CANVAS
{
  const canvas = document.createElement('canvas');
  canvas.width = 32; canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0077b6';
  ctx.beginPath();
  ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width / 2, 0, Math.PI * 2, true);
  ctx.fill();
  ctx.font = 'bold 14px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Evo', canvas.width / 2, canvas.height / 2);
  const faviconUrl = canvas.toDataURL('image/png');
  const link = document.createElement('link');
  link.rel = 'icon';
  link.href = faviconUrl;
  document.head.appendChild(link);}
(function () {
  const logContainer = document.getElementById('logContainer');
  function scrollToBottom() {
    logContainer.scrollTop = logContainer.scrollHeight;
  }
  const lastInfoEntries = {};
  const originalInfo = console.info;
  console.warn = function (...args) {
    const warningMessage = args.join(' ');
    const warningEntry = `<div class="warning">${new Date().toLocaleTimeString()} [WARNING!] ${warningMessage}</div>`;
    logContainer.insertAdjacentHTML('beforeend', warningEntry);
    scrollToBottom();
  };
  console.info = function (...args) {
    const infoMessage = args.join(' ');
    const infoEntry = `<div class="info">${new Date().toLocaleTimeString()} [INFORMATION] ${infoMessage}</div>`;
    logContainer.insertAdjacentHTML('beforeend', infoEntry);
    scrollToBottom();
  };
  console.infoUpdate = function (...args) {
    const infoMessage = args.join(' ');
    const messageKey = infoMessage.split(/[0-9]/)[0].trim();
    if (lastInfoEntries[messageKey]) {
      lastInfoEntries[messageKey].innerHTML = `${new Date().toLocaleTimeString()} [INFORMATION] ${infoMessage}`;
    } else {
      const infoEntry = `<div class="info">${new Date().toLocaleTimeString()} [INFORMATION] ${infoMessage}</div>`;
      logContainer.insertAdjacentHTML('beforeend', infoEntry);
      lastInfoEntries[messageKey] = logContainer.lastElementChild;
    }
    scrollToBottom();
  };
    console.log = function (...args) {
    const logMessage = args.join(' ');
    const logEntry = `<div class="log">${new Date().toLocaleTimeString()} [IMPORTANT] ${logMessage}</div>`;
    logContainer.insertAdjacentHTML('beforeend', logEntry);
    scrollToBottom();
  };
    console.error = function (...args) {
    const errorMessage = args.join(' ');
    const errorEntry = `<div class="error">${new Date().toLocaleTimeString()} [ERROR!] ${errorMessage}</div>`;
    logContainer.insertAdjacentHTML('beforeend', errorEntry);
    scrollToBottom();
  };})();
