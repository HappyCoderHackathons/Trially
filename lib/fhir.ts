export interface FHIRBundle {
  resourceType: "Bundle"
  type: string
  entry?: Array<{ resource: { resourceType: string; [key: string]: unknown } }>
  [key: string]: unknown
}

export type FHIRParseResult =
  | { valid: true; bundle: FHIRBundle; format: "json" | "xml" }
  | { valid: false; error: string }

export async function parseFHIRFile(file: File): Promise<FHIRParseResult> {
  const text = await file.text()

  // --- JSON path ---
  if (file.name.endsWith(".json") || file.type === "application/json") {
    try {
      const parsed = JSON.parse(text)
      if (parsed.resourceType !== "Bundle") {
        return { valid: false, error: "JSON is not a FHIR Bundle (missing resourceType: 'Bundle')" }
      }
      return { valid: true, bundle: parsed as FHIRBundle, format: "json" }
    } catch {
      return { valid: false, error: "Invalid JSON" }
    }
  }

  // --- XML path ---
  if (file.name.endsWith(".xml") || file.type === "application/xml" || file.type === "text/xml") {
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, "application/xml")

    const parseError = doc.querySelector("parsererror")
    if (parseError) return { valid: false, error: "Invalid XML" }

    const root = doc.documentElement
    if (root.localName !== "Bundle" || !root.namespaceURI?.includes("hl7.org/fhir")) {
      return { valid: false, error: "XML is not a valid FHIR R4 Bundle" }
    }

    return { valid: true, bundle: xmlBundleToObject(doc), format: "xml" }
  }

  return { valid: false, error: "File is not a recognized FHIR format (.json or .xml)" }
}

function xmlBundleToObject(doc: Document): FHIRBundle {
  const entries: FHIRBundle["entry"] = []
  doc.querySelectorAll("entry > resource > *").forEach((el) => {
    entries.push({ resource: { resourceType: el.localName } })
  })
  return { resourceType: "Bundle", type: "collection", entry: entries }
}