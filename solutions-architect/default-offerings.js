export const DEFAULT_KNOWLEDGE_CATALOG_VERSION = 1;
export const DEFAULT_KNOWLEDGE_RELEASED_AT = "2026-09-01T00:00:00.000Z";

export const DEFAULT_KNOWLEDGE_OFFERINGS = Object.freeze([
  {
    id: "offering_catalog_pulse",
    name: "PULSE",
    offeringType: "Platform",
    summary: "Simulation platform for unpowered or powered, ballistic or aerodynamically controlled vehicles and associated environmental effects. PULSEbox web-based service enables analysis, demonstration, and visualization of the integrated scene modeling capability.",
    capabilities: ["Systems Engineering & Integration"],
    tags: ["Offering", "Platform"],
    sourceNotes: "Catalog reference: /sites/capabilitiesKB/SitePages/PULSE.aspx"
  },
  {
    id: "offering_catalog_meridian",
    name: "Meridian",
    offeringType: "Platform",
    summary: "Meridian is an enterprise web solution that supports digital transformation through modular tools for mission-critical tasks. It streamlines T&E planning, ordnance allocation, and scheduling; manages TOR creation, editing, and offline use; optimizes warehouse functions like receiving, tracking, and kitting; and automates staff management for compliance, workflow efficiency, and reduced administrative workload.",
    capabilities: ["Counter-UAS and Unmanned Systems (UxS)", "Cyber", "Mission Support", "Space Technologies", "Systems Engineering & Integration", "Test, Evaluation & Training"],
    tags: ["Offering", "Platform"],
    sourceNotes: "Catalog reference: /sites/capabilitiesKB/SitePages/Meridian.aspx"
  },
  {
    id: "offering_catalog_rimfire",
    name: "RIMFIRE",
    offeringType: "Platform",
    summary: "RIMFIRE (Reliability & Improvement through Failure Identification & Reporting) is a scalable failure reporting and analysis system that tracks equipment failure modes, trends, and root causes to improve reliability and maintenance. It enables data-driven decisions by verifying corrective actions, predicting failures, reducing costs, and extending maintenance-free operating periods.",
    capabilities: ["Mission Support"],
    tags: ["Offering", "Platform"],
    sourceNotes: "Catalog reference: /sites/capabilitiesKB/SitePages/RIMFIRE.aspx"
  },
  {
    id: "offering_catalog_space_monkey",
    name: "Space Monkey",
    offeringType: "Product",
    summary: "SmallSat and CubeSat design and development.",
    capabilities: ["Space Technologies"],
    tags: ["Offering", "Technology"],
    sourceNotes: "Catalog reference: /sites/capabilitiesKB/SitePages/Space-Monkey.aspx"
  },
  {
    id: "offering_catalog_veripod",
    name: "VeriPod",
    offeringType: "Product",
    summary: "A compact, independent GPS device that provides standalone location data for UAVs, enhancing situational awareness and operational capabilities in UAS and C-UAS applications.",
    capabilities: ["Counter-UAS and Unmanned Systems (UxS)"],
    tags: ["Offering", "Technology"],
    sourceNotes: "Catalog reference: /sites/capabilitiesKB/SitePages/VeriPod.aspx"
  },
  {
    id: "offering_catalog_rascal",
    name: "Rascal",
    offeringType: "Product",
    summary: "Spectral analyzer and logger, which allows users to record up to 24 hours on a battery or on shore power as long as the mission requires.",
    capabilities: ["Counter-UAS and Unmanned Systems (UxS)"],
    tags: ["Offering", "Technology"],
    sourceNotes: "Catalog reference: /sites/capabilitiesKB/SitePages/Rascal.aspx"
  },
  {
    id: "offering_catalog_asgard",
    name: "ASGARD",
    offeringType: "Application",
    summary: "Locally hosted ChatGPT alternative developed by the local ASGARD Team (Astrion Specialty Group for AI Research & Development). Contains a rich user interface, RAG pipeline, image generation, and file repository.",
    capabilities: ["Counter-UAS and Unmanned Systems (UxS)", "Cyber", "Mission Support", "Space Technologies", "Systems Engineering & Integration", "Test, Evaluation & Training"],
    tags: ["Offering", "Digital Tool"],
    sourceNotes: "Catalog reference: /sites/capabilitiesKB/SitePages/ASGARD.aspx"
  },
  {
    id: "offering_catalog_facet",
    name: "Facet",
    offeringType: "Application",
    summary: "3D facility modeling capability for facility configuration and management. Database capability stores and presents spatial, electrical, and maintenance data in a user-friendly interface.",
    capabilities: ["Mission Support", "Test, Evaluation & Training"],
    tags: ["Offering", "Digital Tool"],
    sourceNotes: "Catalog reference: /sites/capabilitiesKB/SitePages/Facet.aspx"
  },
  {
    id: "offering_catalog_crewflex",
    name: "CrewFlex",
    offeringType: "Application",
    summary: "Solution that provides the means to leverage and address workload surges of mission-critical needs from one area of a contract to another, supporting critical test efforts with minimal work or project stoppage.",
    capabilities: ["Mission Support"],
    tags: ["Offering", "Digital Tool"],
    sourceNotes: "Catalog reference: /sites/capabilitiesKB/SitePages/CrewFlex.aspx"
  },
  {
    id: "offering_catalog_orca",
    name: "ORCA",
    offeringType: "Application",
    summary: "User-friendly suite of tools designed to assess and visualize spaceflight safety risks during launch and reentry.",
    capabilities: ["Space Technologies"],
    tags: ["Offering", "Digital Tool"],
    sourceNotes: "Catalog reference: /sites/capabilitiesKB/SitePages/ORCA.aspx"
  },
  {
    id: "offering_catalog_program_atlas",
    name: "Program Atlas",
    offeringType: "Integrated solution",
    summary: "Integrated Framework for Program Management.",
    capabilities: ["Mission Support"],
    tags: ["Solution"],
    sourceNotes: "Catalog reference: /sites/capabilitiesKB/SitePages/Program-Atlas.aspx"
  },
  {
    id: "offering_catalog_vigilant_compass",
    name: "Vigilant Compass",
    offeringType: "Integrated solution",
    summary: "Cybersecurity Program and Policy Guidance.",
    capabilities: ["Cyber"],
    tags: ["Solution"],
    sourceNotes: "Catalog reference: /sites/capabilitiesKB/SitePages/Vigilant-Compass.aspx"
  },
  {
    id: "offering_catalog_nexus_global",
    name: "Nexus Global",
    offeringType: "Integrated solution",
    summary: "C-UAS Integration and Assessment.",
    capabilities: ["Counter-UAS and Unmanned Systems (UxS)"],
    tags: ["Solution"],
    sourceNotes: "Catalog reference: /sites/capabilitiesKB/SitePages/Nexus-Global.aspx"
  },
  {
    id: "offering_catalog_rangeops_advance",
    name: "RangeOps Advance",
    offeringType: "Integrated solution",
    summary: "Range, Site, and Facility Operations.",
    capabilities: ["Mission Support"],
    tags: ["Solution"],
    sourceNotes: "Catalog reference: /:u:/r/sites/capabilitiesKB/SitePages/RangeOps-Advance.aspx"
  },
  {
    id: "offering_catalog_red_horizon",
    name: "Red Horizon",
    offeringType: "Integrated solution",
    summary: "All Domain Thread Engineering and Simulation.",
    capabilities: ["Systems Engineering & Integration"],
    tags: ["Solution"],
    sourceNotes: "Catalog reference: /sites/capabilitiesKB/SitePages/Red-Horizon.aspx"
  },
  {
    id: "offering_catalog_reliant_core",
    name: "Reliant Core",
    offeringType: "Integrated solution",
    summary: "Reliability Centered Maintenance Program.",
    capabilities: ["Mission Support"],
    tags: ["Solution"],
    sourceNotes: "Catalog reference: /sites/capabilitiesKB/SitePages/Reliant-Core.aspx"
  },
  {
    id: "offering_catalog_vigilant_lab",
    name: "Vigilant Lab",
    offeringType: "Integrated solution",
    summary: "Cyber Penetration Testing (Pen Test) and Red Teaming.",
    capabilities: ["Cyber"],
    tags: ["Solution"],
    sourceNotes: "Catalog reference: /sites/capabilitiesKB/SitePages/Vigilant-Lab.aspx"
  },
  {
    id: "offering_catalog_nexus_pioneer",
    name: "Nexus Pioneer",
    offeringType: "Integrated solution",
    summary: "C-UAS and UxS Mobile Training Teams (MTT).",
    capabilities: ["Counter-UAS and Unmanned Systems (UxS)"],
    tags: ["Solution"],
    sourceNotes: "Catalog reference: /sites/capabilitiesKB/SitePages/Nexus-Pioneer.aspx"
  },
  {
    id: "offering_catalog_testops_advance",
    name: "TestOps Advance",
    offeringType: "Integrated solution",
    summary: "Mission-Threaded Test and Evaluation.",
    capabilities: ["Test, Evaluation & Training"],
    tags: ["Solution"],
    sourceNotes: "Catalog reference: /:u:/r/sites/capabilitiesKB/SitePages/TestOps-Advance.aspx"
  },
  {
    id: "offering_catalog_launch_assure",
    name: "Launch Assure",
    offeringType: "Integrated solution",
    summary: "Space Mission Safety Assurance and Simulation.",
    capabilities: ["Space Technologies"],
    tags: ["Solution"],
    sourceNotes: "Catalog reference: /sites/capabilitiesKB/SitePages/Launch-Assure.aspx"
  },
  {
    id: "offering_catalog_digital_horizon",
    name: "Digital Horizon",
    offeringType: "Integrated solution",
    summary: "Platform, Data, and Software Engineering.",
    capabilities: ["Systems Engineering & Integration"],
    tags: ["Solution"],
    sourceNotes: "Catalog reference: /sites/capabilitiesKB/SitePages/Digital-Horizon.aspx"
  },
  {
    id: "offering_catalog_el_cid",
    name: "EL-CID",
    offeringType: "Product",
    summary: "Energy Logistics - Command, Integration, and Digitization. Web-based application for operational-level wargames that facilitates parallel move inputs in all domains, sequencing of events, and automated engagement detection.",
    capabilities: ["Test, Evaluation & Training", "Mission Support"],
    tags: ["Offering", "Technology"],
    sourceNotes: "Catalog reference: /sites/capabilitiesKB/SitePages/EL-CID.aspx"
  },
  {
    id: "offering_catalog_genesis",
    name: "GENESIS",
    offeringType: "Product",
    summary: "Generic Environment Simulation Stage. GENESIS is a component-based trajectory simulation architecture.",
    capabilities: ["Mission Support", "Test, Evaluation & Training"],
    tags: ["Offering", "Technology"],
    sourceNotes: "Catalog reference: /sites/capabilitiesKB/SitePages/Genesis.aspx"
  },
  {
    id: "offering_catalog_pulsebox",
    name: "PULSEbox",
    offeringType: "Application",
    summary: "Web-based, multi-user service for live displays and visualization of threat simulations. It enables real-time display and post-run visualization in a distributed simulation environment.",
    capabilities: ["Mission Support", "Test, Evaluation & Training"],
    tags: ["Offering", "Digital Tool"],
    sourceNotes: "Catalog reference: /sites/capabilitiesKB/SitePages/PULSEbox.aspx"
  },
  {
    id: "offering_catalog_rxtx",
    name: "RxTx",
    offeringType: "Product",
    summary: "Receive and Transmit. RxTx-Jammer and RxTx-Radar. RxTx-Jammer is a radar-agnostic jammer simulation library. RxTx-Radar is a SPY-1D(mod)/D(V) simulation of radar hardware that includes RxTx Jammer.",
    capabilities: ["Mission Support", "Test, Evaluation & Training"],
    tags: ["Offering", "Technology"],
    sourceNotes: "Catalog reference: /sites/capabilitiesKB/SitePages/RxTx.aspx"
  },
  {
    id: "offering_catalog_ct3",
    name: "CT3",
    offeringType: "Platform",
    summary: "Tabletop C-UAS Training for Fixed-Site and Mobile Operator Proficiency.",
    capabilities: ["Mission Support", "Counter-UAS and Unmanned Systems (UxS)"],
    tags: ["Offering", "Platform"],
    sourceNotes: "Catalog reference: /sites/capabilitiesKB/SitePages/CT3.aspx"
  },
  {
    id: "offering_catalog_aurora",
    name: "AURORA",
    offeringType: "Product",
    summary: "AI/ML Decision-Support and Effect-to-Target Pairing System.",
    capabilities: ["Mission Support"],
    tags: ["Offering", "Technology"],
    sourceNotes: "Catalog reference: /sites/capabilitiesKB/SitePages/AURORA.aspx"
  },
  {
    id: "offering_catalog_space_maneuver_sil_hwil",
    name: "Space Maneuver SIL/HWIL",
    offeringType: "Application",
    summary: "Scalable SIL/HWIL Avionics Test and Simulation for Space Systems.",
    capabilities: ["Space Technologies"],
    tags: ["Offering", "Digital Tool"],
    sourceNotes: "Catalog reference: /sites/capabilitiesKB/SitePages/Space_Maneuver-SIL-HWIL.aspx"
  }
]);
