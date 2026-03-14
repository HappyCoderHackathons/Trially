import https from "https";

function httpsRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          console.log("HTTP Status  :", res.statusCode);
          console.log("Full response:", JSON.stringify(parsed, null, 2));
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on("error", (e) => reject(new Error(`Request error: ${e.message}`)));
    // ── Increased from 25s to 60s ────────────────────────────────────────
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });

    if (body) req.write(body);
    req.end();
  });
}

// ── Aggressively trimmed extraction - only the most critical fields ──────────
function extractRelevantPatientData(findings) {
  const extracted = {};

  for (const [patientId, patient] of Object.entries(findings)) {
    const d    = patient.demographics        || {};
    const dx   = patient.diagnosis           || {};
    const sx   = patient.symptoms            || {};
    const cm   = patient.currentMedications  || [];
    const pm   = patient.previousMedications || [];
    const co   = patient.comorbidities       || [];
    const lab  = patient.labResults          || [];
    const vit  = patient.vitalSigns          || {};
    const pref = patient.trialPreferences    || {};
    const alg  = patient.allergies           || [];
    const con  = patient.consent             || {};

    extracted[patientId] = {
      // ── Essentials only ───────────────────────────────────────────────
      age      : d.age,
      sex      : d.sex,
      country  : d.countryOfResidence,
      volunteer: d.isHealthyVolunteer,

      // ── Diagnosis ─────────────────────────────────────────────────────
      diagnosis: dx.primary,
      secondary: dx.secondary,
      severity : dx.severity,
      duration : dx.duration,

      // ── Symptoms ──────────────────────────────────────────────────────
      symptoms : sx.current,
      painScore: sx.painScore,
      limits   : sx.functionalLimitations,

      // ── Current meds - name + effectiveness only ───────────────────────
      currentMeds: cm.map(m => ({
        name         : m.name,
        dose         : m.dosage,
        effectiveness: m.effectiveness,
        controlled   : m.controlled,
      })),

      // ── Previous meds - only if stopped for a notable reason ───────────
      prevMeds: pm
        .filter(m => m.discontinuedReason || m.adverseEffects?.length)
        .map(m => ({
          name  : m.name,
          reason: m.discontinuedReason,
          AEs   : m.adverseEffects?.length ? m.adverseEffects : undefined,
        })),

      // ── Only flagged lab results ───────────────────────────────────────
      flaggedLabs: lab
        .filter(l => l.flag && l.flag !== "normal")
        .map(l => ({
          test : l.test,
          value: `${l.value} ${l.unit}`,
          ref  : l.referenceRange,
          flag : l.flag,
        })),

      // ── Vitals only if present ─────────────────────────────────────────
      vitals: vit.bmi
        ? {
            bmi: vit.bmi,
            bp : vit.bloodPressure
              ? `${vit.bloodPressure.systolic}/${vit.bloodPressure.diastolic}`
              : undefined,
          }
        : undefined,

      // ── Comorbidities - condition + controlled status only ─────────────
      comorbidities: co.length
        ? co.map(c => ({ condition: c.condition, controlled: c.controlled }))
        : undefined,

      // ── Allergies ─────────────────────────────────────────────────────
      allergies: alg.length
        ? alg.map(a => `${a.substance} (${a.reaction})`)
        : undefined,

      // ── Trial - key fields only ────────────────────────────────────────
      trial: {
        willing        : pref.willingToParticipate,
        phases         : pref.preferredPhases,
        excluded       : pref.excludedInterventionTypes?.length
          ? pref.excludedInterventionTypes
          : undefined,
        maxTravel      : pref.maxTravelDistance,
        visitFrequency : pref.maxVisitFrequency,
        targetPain     : pref.goals?.targetPainScore,
        goals          : pref.goals?.desiredOutcomes,
      },

      consentGiven: con.informedConsent,
      dataSharing : con.dataSharing,
    };

    // ── Remove all undefined keys ──────────────────────────────────────
    extracted[patientId] = JSON.parse(
      JSON.stringify(extracted[patientId])
    );
  }

  return extracted;
}

// ── Process patients in batches to avoid oversized prompts ──────────────────
function chunkPatients(findings, batchSize = 2) {
  const entries = Object.entries(findings);
  const chunks  = [];

  for (let i = 0; i < entries.length; i += batchSize) {
    chunks.push(Object.fromEntries(entries.slice(i, i + batchSize)));
  }

  return chunks;
}

export const handler = async (event) => {
  const { model_name, patient_json } = event;

  // ── Validate input ───────────────────────────────────────────────────────
  if (!model_name) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing required parameter: 'model_name'" }),
    };
  }

  if (!patient_json) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing required parameter: 'patient_json'" }),
    };
  }

  // ── Parse patient JSON ───────────────────────────────────────────────────
  let findings;
  try {
    findings = typeof patient_json === "string"
      ? JSON.parse(patient_json)
      : patient_json;
  } catch (e) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON provided in 'patient_json'" }),
    };
  }

  // ── Extract and trim to relevant fields only ─────────────────────────────
  const relevantData = extractRelevantPatientData(findings);
  const patientCount = Object.keys(relevantData).length;

  // ── Split into batches of 2 patients per API call ────────────────────────
  const batches      = chunkPatients(relevantData, 2);
  const allSummaries = [];

  console.log(`Processing ${patientCount} patients in ${batches.length} batch(es)`);

  for (let i = 0; i < batches.length; i++) {
    const batch      = batches[i];
    const batchKeys  = Object.keys(batch);
    const batchCount = batchKeys.length;

    console.log(`Processing batch ${i + 1}/${batches.length}: ${batchKeys.join(", ")}`);

    // ── Compact system prompt ──────────────────────────────────────────────
    const systemPrompt = `You are a clinical data analyst. Summarise each patient concisely covering:
1. Overview (age, sex, country, diagnosis, severity)
2. Clinical status (symptoms, pain score, limitations)
3. Medications (current effectiveness, past adverse effects)
4. Clinical flags (uncontrolled conditions, flagged labs, declining meds)
5. Trial suitability (phases, goals, exclusions)
No emojis. Only use data provided. Be concise.

Patient Data:
${JSON.stringify(batch, null, 2)}`;

    try {
      const payload = JSON.stringify({
        model   : model_name,
        messages: [
          {
            role   : "system",
            content: systemPrompt,
          },
          {
            role   : "user",
            content: `Summarise the ${batchCount} patient(s) provided.`,
          },
        ],
        // ── Limit response length ────────────────────────────────────────
        max_tokens: 1024,
      });

      console.log(`Batch ${i + 1} payload size: ${Buffer.byteLength(payload)} bytes`);

      const { status, data } = await httpsRequest(
        "https://api.featherless.ai/v1/chat/completions",
        {
          method : "POST",
          headers: {
            "Content-Type"  : "application/json",
            "Content-Length": Buffer.byteLength(payload),
            Authorization   : `Bearer ${process.env.FEATHERLESS_API_KEY}`,
          },
        },
        payload
      );

      if (status !== 200) {
        console.error(`Batch ${i + 1} failed with status ${status}:`, data);
        allSummaries.push(`Batch ${i + 1} error: ${JSON.stringify(data)}`);
        continue;
      }

      const reply = data.choices[0].message.content;
      allSummaries.push(reply);

    } catch (batchError) {
      console.error(`Batch ${i + 1} error:`, batchError.message);
      allSummaries.push(`Batch ${i + 1} failed: ${batchError.message}`);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      model             : model_name,
      patients_analysed : patientCount,
      batches_processed : batches.length,
      summary           : allSummaries.join("\n\n---\n\n"),
    }),
  };
};