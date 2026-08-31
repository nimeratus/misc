"use strict";
var
iurlid = document.getElementById("iurlid") as HTMLInputElement,
ifile = document.getElementById("ifile") as HTMLInputElement & {files: FileList},
burlid = document.getElementById("burlid") as HTMLInputElement,
bfile = document.getElementById("bfile") as HTMLInputElement,
ologs = document.getElementById("ologs") as HTMLElement,
ouser = document.getElementById("ouser") as HTMLElement,
warnings = document.getElementById("warnings") as HTMLElement;

type Thing = {[key:string]:unknown}|unknown[];
type ThingS = Thing&{[key:symbol]:unknown};


type CollisionOptions = {deleteCollidingUnusedVariables: boolean, deleteAllUnusedVariables: boolean, mergeCollidingVariables: boolean, renameCollidingVariables: boolean};
type VariableOptions = CollisionOptions & {stringifyVariables:boolean, replaceVariableIds: boolean, removeVariableNames: boolean};
type DeletedBlockOptions = { deleteGhostBlocks: boolean; deleteInvisibleBlocks: boolean; /** 0=don't, 1=floating reporters, 2=anything not connected to hat blocks */ deleteDisconnectedBlocks: 0 | 1 | 2; deleteSuspiciousOpcodes: boolean; deleteUnknownOpcodes: boolean; };
type BlockFixOptions = { unTopLevelifyReferencedBlocks: boolean; fillSemiOptionalProperties: boolean; copyCustomInputIdsFromDefinition: boolean; cutInvalidReferences: boolean; splitDoublyReferencedBlocks: boolean; repairParentReferences: boolean; replaceBlockIds: boolean; } & CustomBlockOptions & DeletedBlockOptions;
type CustomBlockOptions = { deleteInvalidCustomBlockInputs: boolean; replaceCustomInputIds: boolean; removeRedundantMutations: boolean; deleteDuplicateDefinitions: boolean };
type ProjectFixOptions = {idPrefix: string, deleteLocalBroadcasts: boolean, deleteUnusedMonitors: boolean, skipVariableFixes: boolean} & (VariableOptions|{skipVariableFixes:true}) & BlockFixOptions;

var options:ProjectFixOptions = {
  deleteSuspiciousOpcodes: true,
  deleteUnknownOpcodes: false, // can break projects made using mods or future versions AND can break hacked blocks
  deleteInvisibleBlocks: false, // can break hacked blocks
  deleteGhostBlocks: true, // deletes those invisible blocks that I think can't run
  /** 0=don't, 1=floating reporters, 2=anything not connected to hat blocks. It won't delete the blocks if there are comments attached to them */
  deleteDisconnectedBlocks: 1,
  unTopLevelifyReferencedBlocks: true, // recommended when also using splitDoublyReferencedBlocks
  splitDoublyReferencedBlocks: true, // can freeze if the project has excessive double referencing, but prevents some bugs in the editor
  repairParentReferences: true, // fixes some glitches related to glowing blocks, including some that can freeze the project's display
  fillSemiOptionalProperties: true, // I think Scratch already does this
  replaceBlockIds: false,
  copyCustomInputIdsFromDefinition: true,
  deleteDuplicateDefinitions: true,
  replaceCustomInputIds: true,
  removeRedundantMutations: true,
  //deleteExcessCustomBlockInputDefaults: true, // can break certain hacked blocks
  deleteInvalidCustomBlockInputs: true, // fixes the bug that makes custom block inputs look like they're empty, and some bugs with editing custom blocks. Can change project behavior if not paired with copyCustomInputIdsFromDefinition
  cutInvalidReferences: true, // can prevent certain freezes. Scratch is also doing a version of this
  skipVariableFixes: false, // if false: might creates new variables; if true: below settings are all disabled
  deleteLocalBroadcasts: true, // can break uhm... projects that are hacked in a quite weird way (hacked variable blocks accessing invisible broadcast-variables)
  stringifyVariables: true, // can change variable names
  renameCollidingVariables: true, // can change variable names
  deleteCollidingUnusedVariables: true,
  mergeCollidingVariables: false, // can change project behavior
  deleteUnusedMonitors: true, // can break hacked monitors
  deleteAllUnusedVariables: false, // might deletes variables that are referenced only in sensing blocks
  replaceVariableIds: false, // can break hacked monitors
  removeVariableNames: false, // seems like Scratch undoes it automatically now (it was good for compression but could cause problems if when accidentally deleting a variable and when backpacking)
  idPrefix: Date.now().toString(36)+"S", // added before each generated ID to prevent cross-project ID collisions
};

if(typeof OpcodeType === "undefined") {
  console.log("opcode info is missing");
  // TODO: disable the options that use this list
}

var project, p, zip:Zip;
function disableInputs(x:boolean) {
  iurlid.disabled = ifile.disabled = burlid.disabled = bfile.disabled = x;
}
type LogGroupMap = Map<string,{group:HTMLElement,item?:HTMLElement,title:HTMLElement}>;
function _log(str:string, parent:HTMLElement, logGroups:LogGroupMap, group?:string) {
  var div = document.createElement("div");
  div.innerText = str;
  if(group) {
    let g = logGroups.get(group);
    if(g) {
      if(g.item) {
        g.item.replaceWith(g.group);
        g.group.appendChild(g.item);
        delete g.item;
      }
      g.title.innerText = `${group} (${g.group.children.length})`;
      parent=g.group;
    }
    else {
      g = {group: document.createElement("details"), title:document.createElement("summary"), item: div};
      g.group.appendChild(g.title);
      g.title.innerText = group;
      logGroups.set(group, g);
    }
  }
  parent.appendChild(div);
}
var logGroups:LogGroupMap = new Map();
function log(str:string, group?:string) {
  _log(str, ologs, logGroups, group);
}
var warnGroups:LogGroupMap = new Map();
function warn(str:string, group?:string) {
  _log(str, warnings, warnGroups, group);
}
function displayError(error:unknown) {
  console.error(error);
  let str:string;
  if(error instanceof Error) str = error.stack || String(error);
  else str = String(error);
  log(str);
  ouser.innerText = str;
}

function js2string(obj:any):string {
  switch (typeof obj) {
    case "string":
      return JSON.stringify(obj);
    case "boolean":
    case "number":
    case "undefined":
      return Object.is(obj, -0) ? "-0" : String(obj);
    case "object":
      if (obj === null)
        return "null";
      if (Array.isArray(obj))
        return "[" + obj.map(js2string).join(",") + "]";
      return "{" + Array.from(Object.entries(obj)).map(([k, v]) => js2string(k) + ":" + js2string(v)) + "}";
    default:
      throw new Error("can't stringify " + typeof obj);
  }
}

function isObjectOrArray(thing:unknown): thing is ThingS {
  return typeof (thing) == "object" && thing !== null;
}
function isJSONObject(thing:unknown): thing is Exclude<ThingS, any[]> {
  return isObjectOrArray(thing) && !Array.isArray(thing);
}

// code from https://docs.turbowarp.org/unshared-projects#developers but slightly modified
// {
const getProjectMetadata = async (projectId: string|number) => {
  // IF IN A WEB BROWSER, you need to use a service like trampoline.turbowarp.org to access the Scratch API.
  // IF IN NODE.JS, you should use https://api.scratch.mit.edu/projects/${projectId} directly instead.
  const url = `https://trampoline.turbowarp.org/api/projects/${projectId}`;
  log(`fetching ${url}`);
  const response = await fetch(url);
  if (response.status === 404) {
    throw new Error('The project is unshared or does not exist');
  }
  if (!response.ok) {
    throw new Error(`HTTP error ${response.status} fetching project metadata`);
  }
  const json = await response.json();
  return json;
};

const getProjectData = async (projectId: string|number, metadata: {project_token: string}) => {
  if (!metadata) metadata = await getProjectMetadata(projectId);
  const token = metadata.project_token;
  const urlStart = `https://projects.scratch.mit.edu/${projectId}?token=`;
  log(`fetching ${urlStart}x`);
  const response = await fetch(`${urlStart}${token}`);
  if (!response.ok) {
    throw new Error(`HTTP error ${response.status} fetching project data`);
  }
  const file = await response.blob();
  return file;
};
// }
const idmatcher = /(?<=\/\/[^]*\/)\d+|^\d+$/;
async function fixOnlineProject() {
  disableInputs(true);
  ouser.innerText = "...";
  ologs.innerText = warnings.innerText = "";
  try {
    const projidmatch = idmatcher.exec(iurlid.value);
    if (!projidmatch || !projidmatch[0]) throw new Error("can't extract the project ID from the URL");
    const projectId = projidmatch[0];
    const metadata = await getProjectMetadata(projectId);
    log(metadata.title);
    const file = await getProjectData(projectId, metadata);
    await fixProjectFile(file, metadata.title);
    log("done");
  } catch (error) {
    displayError(error);
  }
  disableInputs(false);
}
async function fixOfflineProject() {
  disableInputs(true);
  ouser.innerText = "...";
  ologs.innerText = warnings.innerText = "";
  try {
    const file = ifile.files[0];
    if (!file) throw new Error("no file selected");
    await fixProjectFile(file, file.name);
    log("done");
  } catch (error) {
    displayError(error);
  }
  disableInputs(false);
}
burlid.onclick = fixOnlineProject;
bfile.onclick = fixOfflineProject;
async function fixProjectFile(file:Blob, name:string) {
  let fname = name;
  const isZip = (await file.slice(0, 1).text() != "{");
  log("plaintext JSON: " + !isZip);
  if (isZip && typeof Zip == "undefined") throw new Error("Zip module is missing, please extract the project.json manually");

  let jsonText;
  const jsonname = "project.json";
  if (isZip) {
    log("trying to open file as zip");
    zip = new Zip(file);
    await zip.loadMetadata();
    if (!zip.hasFile(jsonname)) throw new Error(`can't find ${jsonname} in zip`);
    log("extracting " + jsonname);
    const jsonData = await zip.getFileContentAsync(jsonname);
    jsonText = new TextDecoder().decode(jsonData);
  }
  else {
    log("loading file");
    jsonText = await file.text();
  }

  project = JSON.parse(jsonText);
  p = structuredClone(project);
  log("----\n");

  await new Promise(resolve=>setTimeout(resolve, 0));
  fixProject(project, options);
  await new Promise(resolve=>setTimeout(resolve, 0));

  const fixed = JSON.stringify(project)
  const old=JSON.stringify(p);
  const didChanges = (fixed != old);
  if (!didChanges) {
    log("Nothing has been changed in the project.");
  }
  else {
    const oldL=String(old.length);
    const newL=String(fixed.length);
    let padLength = Math.max(oldL.length, newL.length);
    log(`JSON length: ${oldL.padStart(padLength,"_")} --> ${newL.padStart(padLength,"_")}`);
  }
  let blob = new Blob([fixed], { type: "application/json" });
  if (isZip) {
    const zipout = new ZipMaker();
    await zipout.addFile(blob, "project.json");
    const assetList = zip.listDirectoryContent("").filter(x => !x.endsWith(".json"));
    log(`copying ${assetList.length} assets`);
    await zipout.copyFiles(zip, assetList);
    blob = await zipout.generateZip();
    if (!fname.endsWith(".sb3")) fname += ".sb3";
  }
  const a = document.createElement("a");
  a.download = didChanges ? "fixed-" + fname : fname;
  a.href = URL.createObjectURL(blob);
  a.innerText = "download " + a.download;
  ouser.innerText = "";
  ouser.appendChild(a);
  if(!isZip) warn("the images/sounds are not included in this file, Scratch will load them from its asset server when you open it as a project");
}

type VariableListName = (typeof Variable.lists)[number];
class Variable {
  static defaultValues = {
    variables: 0,
    lists: [],
    broadcasts: null
  };
  static typeNames = {
    variables: "variable",
    lists: "list",
    broadcasts: "broadcast"
  };
  private _nameValue:unknown[];
  list:VariableListName;
  id:string;
  used:boolean;
  wasDefined:boolean;
  unknownName:boolean;
  merged:Variable|null;
  static lists:["variables","lists","broadcasts"] = ["variables","lists","broadcasts"];
  constructor(list:VariableListName, id:unknown, name:unknown) {
    if (list !== "variables" && list !== "lists" && list !== "broadcasts") {
      throw new Error("unknown variable list: " + list);
    }
    this._nameValue = [name, Variable.defaultValues[list]];
    this.list = list;
    this.id = String(id);
    this.wasDefined = false;
    this.unknownName = false;
    this.used = false;
    this.merged=null;
  }
  get name():unknown {
    if(this.merged) return this.merged.name;
    else return this._nameValue[0];
  }
  set name(x) {
    if(this.merged) this.merged.name = x;
    else this._nameValue[0] = x;
  }
  get value():unknown {
    if(this.merged) return this.merged.value;
    return this._nameValue[1];
  }
  get type() {
    return Variable.typeNames[this.list];
  }
  
  mergeWith(v:Variable) {
    while(v.merged) v=v.merged;
    if(v===this) return;
    if(!this.unknownName && v.unknownName || this.wasDefined && !v.wasDefined) {
      v.unknownName=false;
      v._nameValue=this._nameValue;
    }
    if(this.wasDefined && !v.wasDefined) {
      v.wasDefined=true;
      v.id=this.id;
    }
    if(this.used) v.used=true;
    this.merged=v;
  }
  
  updateField(field:unknown[], spriteName:unknown, options:{removeVariableNames:boolean}):void {
    if(this.merged) return this.merged.updateField(field, spriteName, options);
    const newName = options.removeVariableNames ? 0 : this.name;
    if (field[0] !== newName || field[1] !== this.id) {
      log(`${spriteName}: changing a field from ${field[0]} ${field[1]} to ${newName} ${this.id}`, CHANGE_VARIABLE_BLOCKS);
    }
    field[0] = newName
    field[1] = this.id;
  }
  updateBlock(block:unknown[], spriteName:unknown, options:{removeVariableNames:boolean}):void {
    if(this.merged) return this.merged.updateBlock(block, spriteName, options);
    const newName = options.removeVariableNames ? 0 : this.name;
    if (block[1] !== newName || block[2] !== this.id) {
      log(`${spriteName}: changing a block from ${block[1]} ${block[2]} to ${newName} ${this.id}`, CHANGE_VARIABLE_BLOCKS);
    }
    block[1] = newName;
    block[2] = this.id;
  }
  toDefinition():unknown {
    if(this.merged) return this.merged.toDefinition();
    if (this.list === "broadcasts") {
      return this.name;
    }
    else {
      return this._nameValue;
    }
  }
  
  static fromField(fname:string, field:unknown[]):Variable|undefined {
    switch (fname) {
      case "VARIABLE":
        return new Variable("variables", field[1], field[0]);
      case "LIST":
        return new Variable("lists", field[1], field[0]);
      case "BROADCAST_OPTION":
        return new Variable("broadcasts", field[1], field[0]);
    }
  }
  static fromBlock(block:unknown[]):Variable|undefined {
    switch (block[0]) {
      case 11:
        return new Variable("broadcasts", block[2], block[1]);
      case 12:
        return new Variable("variables", block[2], block[1]);
      case 13:
        return new Variable("lists", block[2], block[1]);
    }
  }
  static fromDefinition(list:VariableListName, id:unknown, def:unknown):Variable|undefined {
    if (list == "broadcasts") {
      let res = new Variable(list, id, def);
      res.wasDefined = true;
      return res;
    }
    else if(Array.isArray(def)) {
      let res = new Variable(list, id, def[0]);
      res._nameValue = def;
      res.wasDefined = true;
      return res;
    }
  }
}

const RENAME_VARIABLE = "renamed some variables";
const RENAME_COLLIDING_VARIABLE = "renamed some variables to avoid name collision";
const DELETED_WITH_DATA = "deleted variables that contain data";
const DELETED_NAME_COLLISION = "deleting variables to avoid name collision";
const DELETED_UNUSED = "deleting unused variables";
const CREATE_VARIABLE = "created missing variables";
const CHANGE_VARIABLE_BLOCKS = "changed the variable info in some blocks";

class VariableManager {
  spriteName:unknown;
  parent:VariableManager|null;
  idMap:Map<string,Variable>;
  nameMaps:Record<VariableListName, Map<unknown, Variable>>;

  constructor(spriteName:unknown, parent:VariableManager|null = null) {
    this.spriteName = spriteName;
    this.parent = parent;
    this.idMap = new Map();
    this.nameMaps = {
      variables: new Map(),
      lists: new Map(),
      broadcasts: new Map()
    };
  }
  
  addDefinitionsFromSprite(sprite:{variables?:{},lists?:{},broadcasts?:{},name?:unknown}) {
    let added:Variable[] = [];
    for (const list of Variable.lists) {
      if (!sprite[list]) continue;
      for (const [id, def] of Object.entries(sprite[list])) {
        const v = Variable.fromDefinition(list, id, def);
        if(!v) {
          log(`${sprite.name}: invalid variable definition for ID ${id}`, "found invalid variable definitions");
          continue;
        }
        added.push(v);
        this.idMap.set(v.id, v);
      }
    }
    for (const v of added) {
      const idMatch:Variable = this.idMap.get(v.id)!; // everything added to "added" was also added to "idMap"
      if (idMatch !== v) {
        log(`${sprite.name}: deleting ${v.type} ${v.name} due to ID collision with ${idMatch.type} ${idMatch.name} (id = ${v.id})`, "deleting variables due to ID collision");
        continue;
      }
      const map = this.nameMaps[v.list];
      if (typeof v.name == "string") {
        if (!map.has(v.name)) {
          map.set(v.name, v);
        }
      }
      else {
        log(`${sprite.name}: ${v.type} name is not a string. ${js2string(v.name)}`, "the name of some variables isn't a string");
      }
    }
  }

  findById(v:{id:unknown}|null|undefined):Variable|undefined {
    if (!v ||typeof(v.id)!=="string") return;
    if (this.idMap.has(v.id)) {
      return this.idMap.get(v.id)!;
    }
    if (this.parent) {
      return this.parent.findById(v);
    }
  }
  findLocalByName(v:{list:VariableListName,name:unknown}|null|undefined):Variable|undefined {
    if (!v) return;
    return this.nameMaps[v.list].get(v.name);
  }
  findByName(v:{list:VariableListName,name:unknown}|null|undefined):Variable|undefined {
    if (!v) return;
    const found = this.findLocalByName(v);
    if (found) return found;
    if (this.parent) {
      return this.parent.findByName(v);
    }
  }
  find(v:{list:VariableListName, name:unknown, id:string}|undefined|null):Variable|undefined {
    if(!v) return;
    if(v.list === "broadcasts" && this.parent) {
      // only search for global broadcasts
      return this.parent.find(v);
    }

    return this.findById(v) || this.findByName(v);
  }

  findOrMake(v:Variable):Variable;
  findOrMake(v:Variable|null|undefined):Variable|undefined;
  findOrMake(v:Variable|null|undefined):Variable|undefined {
    if (!v) return;
    const found = v.unknownName ? this.findById(v) : this.find(v);
    if (found) {
      if(found.unknownName && (!v.unknownName || typeof(found.name)!=="string"&&typeof(v.name)==="string")) {
        found.name=v.name;
        found.unknownName=v.unknownName;
      }
      return found;
    }
    let x:VariableManager=this;
    if(v.list === "broadcasts") {
      // always define broadcasts as global
      while(x.parent) x=x.parent;
    }
    x.idMap.set(v.id, v);
    if (typeof v.name == "string") {
      x.nameMaps[v.list].set(v.name, v);
    }
    return v;
  }

  stringifyNames() {
    for (const v of this.idMap.values()) {
      if (typeof v.name !== "string") {
        v.name = js2string(v.name);
        log(`${this.spriteName}: stringified ${v.type} name ${v.name} (id = ${v.id})`, RENAME_VARIABLE);
      }
      else if ("nameOrigin" in v) {
        // prevent losing array nesting info from Scratch 2.0 hacked blocks
        v.name = js2string(v.nameOrigin);
        log(`${this.spriteName}: renaming ${v.type} ${v.nameOrigin} to ${v.name} (id = ${v.id})`, RENAME_VARIABLE);
      }
    }
  }

  deleteVariable(v:Variable) {
    if (this.idMap.get(v.id) === v) {
      this.idMap.delete(v.id);
      this.nameMaps[v.list].delete(v.name);
      // assume that none of the colliding variables were added to the name map yet
    }
    else if (this.parent) {
      this.parent.deleteVariable(v);
    }
  }

  hasDefaultValue(v:Variable) {
    return js2string(v.value) === js2string(Variable.defaultValues[v.list]);
  }

  /** renames/deletes collisions, and also every unused variable, if permitted in the options */
  renameOrDeleteCollisions(options:Readonly<CollisionOptions>) {
    this.nameMaps = {
      variables: new Map(),
      lists: new Map(),
      broadcasts: new Map()
    };
    const deleteCollidingUnused = options.deleteCollidingUnusedVariables || options.deleteAllUnusedVariables;
    for (const v of this.idMap.values()) {
      const found = options.deleteCollidingUnusedVariables && this.findByName(v);
      if (found) {
        const vData = js2string(v.value);
        const isVdefault = this.hasDefaultValue(v);
        const fData = js2string(found.value);
        const isFdefault = this.hasDefaultValue(found);
        if(options.mergeCollidingVariables) {
          this.idMap.delete(v.id);
          v.mergeWith(found); // this makes it so that blocks using it will be converted into the right variable
          continue;
        }
        else if (deleteCollidingUnused && !v.used && (isVdefault || options.deleteAllUnusedVariables)) {
          if(!isVdefault) warn(`${this.spriteName}: deleting ${v.type} ${v.name} that contains ${vData.length>20?"data":vData}, because its name collides with another variable (deleted id=${v.id}  other id=${found.id})`, DELETED_WITH_DATA);
          log(`${this.spriteName}: deleting unused ${v.type} ${v.name} to avoid name collision (deleted id=${v.id}  other id=${found.id})`, DELETED_NAME_COLLISION);
          this.idMap.delete(v.id);
          continue; // don't add this version to the name map
        }
        else if (deleteCollidingUnused && !found.used && (isFdefault || options.deleteAllUnusedVariables)) {
          if(!isFdefault) warn(`${this.spriteName}: deleting ${found.type} ${found.name} that contains ${fData.length>20?"data":fData}, because its name collides with another variable (deleted id = ${found.id}  other id = ${v.id})`, DELETED_WITH_DATA);
          log(`${this.spriteName}: deleting unused ${found.type} ${found.name} to avoid name collision (deleted id=${found.id}  other id=${v.id})`, DELETED_NAME_COLLISION);
          this.deleteVariable(found);
        }
        else if (options.renameCollidingVariables) {
          const original = v.name;
          const start = v.name + " ";
          let end = 1;
          do {
            end += 1;
            v.name = start + end;
          } while (this.findByName(v));
          log(`${this.spriteName}: renaming ${v.type} ${original} to ${v.name} to avoid name collision (renamed id = ${v.id}  other id = ${found.id})`, RENAME_COLLIDING_VARIABLE)
        }
      }
      else if(options.deleteAllUnusedVariables && !v.used) {
        const data = js2string(v.value);
        log(`${this.spriteName}: deleting unused ${v.type} ${v.name} (id=${v.id})`, DELETED_UNUSED);
        if(data !== js2string(Variable.defaultValues[v.list])) {
          warn(`${this.spriteName}: deleting ${v.type} ${v.name} that contains ${data.length>20?"data":data}, because it seems to be unused (id=${v.id})`, DELETED_WITH_DATA);
        }
        this.idMap.delete(v.id);
        continue; // don't add to name map
        // don't use else because that prevents adding to the name map when a renaming happens
      }
      this.nameMaps[v.list].set(v.name, v);
    }
  }
  /** @param newIds - iterator that generates unique variable IDs */
  replaceVarIds(newIds:Iterator<string>) {
    let idMap = new Map();
    for(const v of this.idMap.values()) {
      v.id = newIds.next().value;
      idMap.set(v.id, v);
    }
    this.idMap = idMap;
  }
  updateSpriteDefinitions(sprite:Sprite) {
    sprite.variables = {};
    sprite.lists = {};
    sprite.broadcasts = {};
    for (const v of this.idMap.values()) {
      if (!v.wasDefined) {
        log(`${sprite.name}: creating ${v.type} ${v.name} ${v.id}`, CREATE_VARIABLE);
      }
      sprite[v.list]![v.id] = v.toDefinition();
    }
  }
  
  *localVariables() {
    yield* this.idMap.values();
  }
  *variables():Generator<Variable> {
    yield* this.localVariables();
    if(this.parent) yield* this.parent.variables();
  }
}
interface Sprite {variables?:Record<string,unknown>,lists?:Record<string,unknown>,broadcasts?:Record<string,unknown>}

function* allBlocks(blocks:unknown):Generator<ThingS> {
  if(!blocks) return;
  for (const block of Object.values(blocks)) {
    if (!isObjectOrArray(block)) continue;
    yield block;
    if(Array.isArray(block)) continue;
    if (isObjectOrArray(block.inputs)) {
      for (const inp of Object.values(block.inputs)) {
        if(Array.isArray(inp)) yield* allBlocks(inp);
      }
    }
    if (isObjectOrArray(block.next)) {
      yield* allBlocks([block.next]);
    }
  }
}

const Svar = Symbol("variable");
function markVarUse(v:Variable|undefined|null, use:any) {
  if (!v) return;
  v.used = true;
  use[Svar] = v;
}

/** 
 * @param skip - the set of those IDs that the generator mustn't generate
 **/
function* prefixedIncrementalIDs(prefix:string, skip:Set<string>) {
  let i=0;
  while(true) {
    const thing = prefix+(i++).toString(36);
    if(Number.isNaN(+thing) && !skip.has(thing)) yield thing;
  }
}

function fixProject(project:unknown, options:Readonly<ProjectFixOptions>) {
  if (!isJSONObject(project)) throw new Error("project is not an object");
  if (!Array.isArray(project.targets)) throw new Error("project.targets is not an array");
  const targets:unknown[] = project.targets;
  let monitors:unknown[];
  if (!Array.isArray(project.monitors)) {
    log(`project.monitors was not an array`);
    monitors = project.monitors = [];
  }
  else {
    monitors = project.monitors;
  }
  if(!targets.every(isJSONObject)) {
    throw new Error(`project.targets[${targets.findIndex(x=>!isJSONObject(x))}] is not an object`);
  }
  
  const Stages = targets.filter(x => x.isStage);
  if (Stages.length !== 1) throw new Error(`expected 1 Stage, found ${Stages.length}`);
  const Stage = Stages[0];
  if (targets[0] !== Stage) throw new Error(`expected the Stage to be the first in the sprite list`);

  const spriteNameMap = new Map<unknown, number>();
  for (let i = 0; i < targets.length; i++) {
    const sprite = targets[i];
    if (sprite.isStage) continue;
    if (spriteNameMap.has(sprite.name)) {
      log(`there are multiple sprites named ${sprite.name}`);
    }
    else spriteNameMap.set(sprite.name, i);
  }
  const showableMonitorIDs=new Set();
  const globals = new VariableManager(Stage.name);
  const varLists = targets.map(
    sprite => sprite == Stage ? globals : new VariableManager(sprite.name, globals)
  );
  const blockLists = targets.map(
    sprite => new BlockSpagetti(Object.setPrototypeOf(sprite.blocks, null))
  );

  for(let i=0; i<targets.length; i++) {
    if(options.unTopLevelifyReferencedBlocks) {
      const count = unTopLevelifyReferencedBlocks(blockLists[i]);
      if(count>0) log(`${targets[i].name}: removed topLevel mark from ${count} referenced blocks`);
    }
    deleteProblematicBlocks(blockLists[i], targets[i], options);
  }

  if(options.skipVariableFixes) {
    // find all variable ID-like things in the project
    const ids=new Set<string>();
    for(const sprite of targets) {
      for(const listName of Variable.lists) {
        const list = sprite[listName];
        if(isJSONObject(list)) {
          for(const id of Object.keys(list)) ids.add(id);
        }
      }
    }
    for(const spagetti of blockLists) {
      for(const {block} of spagetti.blocks()) {
        if(Array.isArray(block)) {
          const v = Variable.fromBlock(block);
          if(v) ids.add(v.id);
        }
        else if(isJSONObject(block) && isJSONObject(block.fields)) {
          for(const [fname, field] of Object.entries(block.fields)) {
            if(!Array.isArray(field)) continue;
            const v=Variable.fromField(fname, field);
            if(v) ids.add(v.id);
          }
        }
      }
    }

    for(let i=0; i<targets.length; i++) {
      doBlockFixes(blockLists[i], targets[i], ids, options.idPrefix+i.toString(36), options);
    }
  }
  else {
  // get variables from the definitions and the variable/list/broadcast blocks
  for (let i = 0; i < targets.length; ++i) {
    const sprite = targets[i];
    const varList = varLists[i];
    if(i>0 && sprite.broadcasts && Object.keys(sprite.broadcasts).length>0) {
      if(options.deleteLocalBroadcasts) {
        log(`${sprite.name}: deleting local broadcast definitions`, "deleting local broadcasts");
        sprite.broadcasts={};
      }
      else {
        log(`${sprite.name}: found broadcast definitions but normally they should be in the Stage`, "found local broadcasts");
      }
    }
    varList.addDefinitionsFromSprite(sprite);
    for (const block of allBlocks(sprite.blocks)) {
      if (Array.isArray(block)) {
        const v = varList.findOrMake(Variable.fromBlock(block));
        markVarUse(v, block);
      }
      else if (isJSONObject(block.fields)) {
        for (const [fname, field] of Object.entries(block.fields)) {
          if(!Array.isArray(field)) {
            log(`${sprite.name}: field was not an array: deleting`);
            delete block.fields[fname];
            continue;
          }
          const f=Variable.fromField(fname, field);
          switch(block.opcode) {
            case "data_showvariable":
            case "data_showlist":
              showableMonitorIDs.add(String(field[1]));
              // ↓ continue with marking the name unknown
            case "data_hidevariable":
            case "data_hidelist":
              // these blocks only care about the ID part of the field
              if(f) f.unknownName=true;
              break;
          }
          const v = varList.findOrMake(f);
          markVarUse(v, field);
        }
      }
    }
  }
  // mark the variables of sensing blocks, so the renamings can affect them
  for (const sprite of targets) {
    if(!isJSONObject(sprite.blocks)) continue;
    for (const block of allBlocks(sprite.blocks)) {
      if (!isJSONObject(block) || block.opcode !== "sensing_of") continue;
      if (!isJSONObject(block.fields) || !isJSONObject(block.inputs)) continue;
      if (!Array.isArray(block.fields.PROPERTY) || !Array.isArray(block.inputs.OBJECT)) continue;
      const inp:unknown[] = block.inputs.OBJECT;
      let spriteBlock:unknown = inp[2] && sprite.blocks[String(inp[2])];
      if (!isJSONObject(spriteBlock) || spriteBlock.opcode !== "sensing_of_object_menu") {
        spriteBlock = inp[1] && sprite.blocks[String(inp[1])];
      }
      if (!isJSONObject(spriteBlock) || spriteBlock.opcode !== "sensing_of_object_menu") continue;
      if (!isJSONObject(spriteBlock.fields)) continue;
      if (!Array.isArray(spriteBlock.fields.OBJECT)) continue;
      const spriteName = spriteBlock.fields.OBJECT[0];
      const varName = block.fields.PROPERTY[0];
      const spriteIdx = spriteName == "_stage_" ? 0 : spriteNameMap.get(spriteName);
      if (typeof spriteIdx !== "number") continue;
      const v = varLists[spriteIdx].findLocalByName({ name: varName, list: "variables" });
      markVarUse(v, block.fields.PROPERTY);
    }
  }
  // monitors
  monitors = project.monitors = monitors.filter((m,idx) => {
    if(!isJSONObject(m)) {
      log(`project.monitors[${idx}] was not an object: deleting`);
      return false;
    }
    let spriteIdx=0;
    if(typeof(m.spriteName)=="string" && spriteNameMap.has(m.spriteName)) {
      spriteIdx=spriteNameMap.get(m.spriteName)!;
    }
    let canShowUp = m.visible || showableMonitorIDs.has(m.id);
    let varList = varLists[spriteIdx || (targets.length>1?1:0)];
    let fieldVars:{params:Record<string,Variable>,id:Variable|undefined}=m[Svar]={params:{},id:varList.findById({id:m.id})};
    let displayName="";
    if(isJSONObject(m.params)) {
      for(let [pname, param] of Object.entries(m.params)) {
        let field=[param];
        if(m.opcode==="data_variable"||m.opcode==="data_listcontents") {field[1]=m.id; displayName=String(param);}
        const f=Variable.fromField(pname, field);
        const v=canShowUp?varList.findOrMake(f):varList.find(f);
        if(!v) continue;
        if(canShowUp) v.used=true;
        fieldVars.params[pname]=v;
      }
    }
    if(!canShowUp && options.deleteUnusedMonitors) {
      log(`${targets[spriteIdx].name}: deleting unused monitor ${m.opcode} ${displayName} (id=${m.id})`, "deleting unused monitors");
      return false;
    }
    return true;
  });

  for(let i=0; i<targets.length; i++) {
    doBlockFixes(blockLists[i], targets[i], Array.from(varLists[i].variables(), v=>v.id), options.idPrefix+i.toString(36), options);
  }

  // now that the variables are collected, find out what to change
  const forbiddenIDs = new Set<string>(); // empty set
  for (let i = 0; i < targets.length; ++i) {
    const varList = varLists[i];

    if(options.stringifyVariables) varList.stringifyNames();
    varList.renameOrDeleteCollisions(options);
    if(options.replaceVariableIds) {
      varList.replaceVarIds(prefixedIncrementalIDs(`${options.idPrefix}${i.toString(36)}V`, forbiddenIDs));
      for(const v of varList.localVariables()) forbiddenIDs.add(v.id);
    }
  }
  
  // apply changes
  for (let i = 0; i < targets.length; ++i) {
    const sprite = targets[i];
    const varList = varLists[i];
    varList.updateSpriteDefinitions(sprite);

    for (const block of allBlocks(sprite.blocks)) {
      if (Array.isArray(block)) {
        if (block[Svar]) {
          const v = block[Svar] as Variable;
          v.updateBlock(block, sprite.name, options);
        }
      }
      else if (isJSONObject(block.fields)) {
        for (const [fname, field] of Object.entries(block.fields)) {
          if (Array.isArray(field) && (field as ThingS)[Svar]) {
            const v=(field as ThingS)[Svar] as Variable;
            if (fname === "PROPERTY") {
              if(field[0] !== v.name) log(`${sprite.name}: changing variable in a sensing block's field from ${field[0]} to ${v.name}`, CHANGE_VARIABLE_BLOCKS);
              field[0] = v.name;
            }
            else {
              v.updateField(field, sprite.name, options);
            }
          }
        }
      }
    }
  }
  for(const m of monitors) {
    if(!isJSONObject(m)) continue; // impossible because we deleted those
    const fieldVars = m[Svar] as {params: Record<string, Variable>, id: Variable|undefined};
    if(isJSONObject(m.params)) {
      for(const pname of Object.keys(m.params)) {
        if(pname in fieldVars.params) { //
          m.params[pname]=fieldVars.params[pname].name;
          if(m.opcode === "data_variable" || m.opcode === "data_listcontents") {
            m.id = fieldVars.params[pname].id;
          }
        }
      }
    }
    if(fieldVars.id) m.id=fieldVars.id.id;
  }
  }
}

type BlockId = string;
function isID(thing:unknown):thing is BlockId {
  return typeof(thing)==="string";
}

/** copies everything that can be turned into JSON and a few things that can't (eg. undefined); doesn't copy random properties set on arrays */
function deepClone<T>(x:T):T {
  if(typeof x!=="object" || x===null) return x;
  if(Array.isArray(x)) {
    // @ts-ignore
    return x.map(x=>deepClone(x));
  }
  let res={};
  for(const [key, value] of Object.entries(x)) {
    Object.defineProperty(res, key, {writable:true,configurable:true,enumerable:true,value:deepClone(value)});
  }
  // @ts-ignore
  return res;
}

class DataPos<K extends string|number|symbol, V> {
  readonly obj:Partial<Record<K,V>>;
  readonly key:K;
  /** if you use this, make sure that either the object has null prototype or that the key is controlled to avoid prototype pollution */
  constructor(obj:typeof this.obj, key:K) {
    this.obj=obj;
    this.key=key;
  }
  read():V|undefined {
    return this.obj[this.key];
  }
  write(value:V) {
    this.obj[this.key]=value;
  }
  deleteValue() {
    return delete this.obj[this.key];
  }
  exists(): this is {read():V} {
    return (this.key in this.obj);
  }
  isSame(p: DataPos<any,any>) {
    return p.obj===this.obj && p.key===this.key;
  }
}
type Pointer<V> = DataPos<string,V>|DataPos<number,V>|DataPos<symbol,V>;

type Mutation = { proccode: string; argumentdefaults?: string; argumentnames?: string; argumentids?: string; warp?: string | boolean | null; hasNext?: string | boolean | null; tagName?: "mutation"; children?: []; };
type BlockObject = { opcode?: string; inputs?: unknown; fields?: unknown; next?: unknown; parent?: unknown; topLevel?: boolean; shadow?: boolean; comment?: string; mutation?: Mutation; };
type Block = BlockObject | unknown[];
interface Sprite {
  name?: unknown,
  blocks?: Record<string, Block>,
  comments?: Record<string, {blockId?: string}>
}

function isMarkedTopLevel(block:Block) {
  if(isJSONObject(block)) return !!block.topLevel;
  if(Array.isArray(block)) return block.length>3;
  return false;
}

type BlockInfo = {block:Block, ptr:Pointer<Block>, id:string|null}
/** helper for modifying sprite.blocks */
class BlockSpagetti {
  json:Record<BlockId, Block>;
  /** block => (referencerBlock => referencePosition[]) */
  private blocksToReferences:Map<Block, Map<Block, Pointer<BlockId|Block>[]>>;
  blocksToIDs:Map<Block, BlockId|null>;
  /**
   * @param json mustn't have setters in its prototype
   */
  constructor(json:Record<BlockId,Block>&{__proto__?:never}) {
    this.json = json;
    this.blocksToReferences = new Map();
    this.blocksToIDs = new Map();
    this.recalculateThings();
  }
  recalculateThings() {
    this.blocksToReferences.clear();
    this.blocksToIDs.clear();
    for(const {id, block} of this.blocks()) {
      this.readdInFwdConnections(block, []);
      this.blocksToIDs.set(block, id);
    }
  }
  *getInlineBlocksIn(block:Block):Generator<BlockInfo & {id: null}, void> {
    if(!isJSONObject(block) || !isJSONObject(block.inputs)) return;
    for(const [iname, iarr] of Object.entries(block.inputs)) {
      if(!Array.isArray(iarr)) continue;
      for(let i=1; i<iarr.length; i++) {
        const block=iarr[i];
        if(isObjectOrArray(block)) {
          yield {block:block, id:null, ptr: new DataPos(iarr,i)};
          yield* this.getInlineBlocksIn(block);
        }
      }
    }
  }
  *blocks():Generator<BlockInfo, void> {
    for(const [id, block] of Object.entries(this.json)) {
      yield {id, block, ptr: new DataPos<string, Block>(this.json, id)};
      yield* this.getInlineBlocksIn(block);
    }
  }
  private addRef(referencer: Block, block:Block, refPos:Pointer<Block|BlockId>) {
    if(!this.blocksToReferences.has(block)) {
      this.blocksToReferences.set(block, new Map());
    }
    let referencersToPositions = this.blocksToReferences.get(block)!;
    if(!referencersToPositions.has(referencer)) {
      referencersToPositions.set(referencer, []);
    }
    referencersToPositions.get(referencer)!.push(refPos);
  }
  *getReferencers(block:Block):Generator<{referencer:Block, positions:Pointer<BlockId|Block>[]},void> {
    if(this.blocksToReferences.has(block)) {
      for(const [referencer, positions] of this.blocksToReferences.get(block)!.entries()) {
        yield {referencer, positions};
      }
    }
  }
  *getReferencesTo(block:Block):Generator<{referencer:Block, refPos:Pointer<BlockId|Block>},void> {
    for(const {referencer, positions} of this.getReferencers(block)) {
      for(const refPos of positions) {
        yield {referencer, refPos};
      }
    }
  }
  hasReferencers(block:Block) {
    for(const _ of this.getReferencers(block)) {
      return true;
    }
    return false;
  }

  /**
   * returns the forwards connections of the block - the blocks that it references, except in the "parent" field, because that is a backwards reference
   */
  *getFwdRefs(block:Block):Generator<{pos:Pointer<Block>,id:Block,block:Block}|{pos:Pointer<BlockId>,id:BlockId,block:Block|undefined}, void> {
    if(!isJSONObject(block)) return;
    const next = this.toFwdRef(new DataPos<"next",any>(block, "next"));
    if(next) yield next;
    if(isJSONObject(block.inputs)) {
      for(const [iname, iarr] of Object.entries(block.inputs)) {
        if(!Array.isArray(iarr)) continue;
        for(let i=1 /* iarr[0] has another meaning */; i<iarr.length; i++) {
          const input = this.toFwdRef(new DataPos(iarr, i));
          if(input) yield input;
        }
      }
    }
  }
  
  toFwdRef(pos:Pointer<any>):{pos:Pointer<Block>,id:Block,block:Block}|{pos:Pointer<BlockId>,id:BlockId,block:Block|undefined}|undefined {
    const id = pos.read();
    if(isID(id)) {
      return {block:this.json[id], id, pos: (pos as Pointer<BlockId>)};
    }
    else if(isObjectOrArray(id)) {
      return {block:id, id, pos: (pos as Pointer<Block>)}
    }
  }

  /**
   * @param block the block whose descendants will be added
   * @param outputSet a set that (before and after calling this function) must have the property that if it contains a block then it also contains its descendants
   */
  addDescendantsOfBlockToSet(block:Block, outputSet:Set<Block>):void {
    const stack = [block];
    let b;
    while(b = stack.pop()) {
      for(const fwd of this.getFwdRefs(b)) {
        if(!fwd.block || outputSet.has(fwd.block)) continue;
        outputSet.add(fwd.block);
        stack.push(fwd.block);
      }
    }
  }

  /** @returns how many blocks were deleted */
  deleteBlocksWithoutSatisfyingAncestor(condition:(block:BlockInfo)=>boolean):number {
    let count=0;
    const keptBlocks = new Set<Block>();

    for(const info of this.blocks()) {
      if(condition(info)) {
        this.addDescendantsOfBlockToSet(info.block, keptBlocks);
        keptBlocks.add(info.block);
      }
    }
    for(const {block, ptr: blockPtr} of this.blocks()) {
      if(keptBlocks.has(block)) continue;
        
      // no longer count this block as a referencer
      this.forgetInFwdConnections(block);

      this.blocksToReferences.delete(block);
      this.blocksToIDs.delete(block);

      // the blocks that reference this one will be deleted anyways, so they don't have to be updated
      blockPtr.deleteValue();
      count+=1;
    }
    return count;
  }

  /**
   * forgets all connections of the block
   * @returns the fwd-references of the blocks whose back-reference was deleted
   */
  forgetInFwdConnections(block:Block) {
    let fwds=[];
    for(const fwd of this.getFwdRefs(block)) {
      if(!fwd.block) continue;
      fwds.push(fwd);
      this.blocksToReferences.get(fwd.block)?.delete(block);
    }
    return fwds;
  }

  /**
   * scans the block for connections
   * @param checkForDeletion the value `this.forgetConnections()` returned before making changes to the block's JSON
   */
  readdInFwdConnections(block:Block, checkForDeletion:Exclude<ReturnType<typeof this.toFwdRef>,undefined>[]) {
    for(const fwd of this.getFwdRefs(block)) {
      if(fwd.block) {
        this.addRef(block, fwd.block, fwd.pos);
      }
    }
    this.deleteUnreferenced(checkForDeletion);
  }

  /** deletes the block; if recursive, it also deletes the inputs and the blocks below it */
  deleteBlock(blockPtr: Pointer<Block>, recursive=true) {
    const block=blockPtr.read();
    blockPtr.deleteValue();

    if(!isJSONObject(block)) return;

    // no longer count this block as a referencer
    this.forgetInFwdConnections(block);

    // erase the reference from the blocks that referenced this
    const referencers = this.blocksToReferences.get(block);
    for(const [referencer, positions] of referencers||[]) {
      referencers!.delete(referencer);
      for(const pos of positions) {
        // null wasn't allowed until now only because it can't store null while the block that it references exists
        (pos as Pointer<string|Block|null>).write(null);
      }
    }
    this.blocksToReferences.delete(block);

    this.blocksToIDs.delete(block);

    if(recursive) {
      this.deleteUnreferenced(this.getFwdRefs(block));
    }
  }

  /** deletes the block; if recursive, it also deletes the inputs, but it tries to attach the block below it to the block above it */
  deleteBlockButKeepStack(blockPtr: Pointer<Block>, recursive=true) {
    const block=blockPtr.read();
    blockPtr.deleteValue();

    if(!isJSONObject(block)) return;

    // no longer count this block as a referencer
    this.forgetInFwdConnections(block);

    // make the blocks that referenced this reference the next block instead
    let next = this.toFwdRef(new DataPos<"next",any>(block, "next"));
    if(!next?.block) {
      next = void 0;
    }
    
    const referencers = this.blocksToReferences.get(block);
    for(const [referencer, positions] of referencers||[]) {
      referencers!.delete(referencer);
      for(const pos of positions) {
        if(next) {
          pos.write(next.id);
          this.addRef(referencer, next.block!, pos);
        }
        else {
          // null wasn't allowed until now only because it can't store null while the block that it references exists
          (pos as Pointer<string|Block|null>).write(null);
        }
      }
    }
    this.blocksToReferences.delete(block);

    this.blocksToIDs.delete(block);

    if(recursive) {
      this.deleteUnreferenced(this.getFwdRefs(block));
    }
  }

  /** 
   * not perfect as circular references can prevent blocks from getting deleted
   * @param oldConnections the connections to the blocks that might have became unreferenced
   * @private
   **/
  deleteUnreferenced(oldConnections: Iterable<Exclude<ReturnType<typeof this.toFwdRef>,undefined>>) {
    const stack = [oldConnections];
    let currentList;
    while(currentList = stack.pop()) {
      for(const fwd of currentList) {
        if(fwd.block && !this.hasReferencers(fwd.block) && !isMarkedTopLevel(fwd.block)) {
          const ptr:Pointer<Block> = isID(fwd.id) ? new DataPos<string,Block>(this.json, fwd.id) : (fwd.pos as Pointer<Block>);
          this.deleteBlock(ptr, false);
          stack.push(this.getFwdRefs(fwd.block));
        }
      }
    }
  }

  /** 
   * Deletes the blocks that don't satisfy the condition, and tries to attach the block below them to the block above them
   * @returns how many blocks were deleted
   */
  deleteBlocksThatDontSatisfy(condition:(block:BlockInfo)=>boolean) {
    let count = 0;
    for(const info of this.blocks()) {
      if(condition(info)) continue;
      this.deleteBlockButKeepStack(info.ptr);
      count+=1;
    }
    return count;
  }

  /**
   * returns every place where a block ID (or a block) can be referenced by a block
   */
  *idsInBlock(block:Block):Generator<Pointer<unknown>,void> {
    if(!isJSONObject(block)) return;
    if("next" in block) yield new DataPos(block,"parent");
    if("parent" in block) yield new DataPos(block, "next");
    if(!isJSONObject(block.inputs)) return;
    for(const iarr of Object.values(block.inputs)) {
      if(!Array.isArray(iarr)) continue;
      for(let i=1; i<iarr.length; i++) {
        yield new DataPos(iarr, i);
      }
    }
  }
}

function deleteProblematicBlocks(spagetti:BlockSpagetti, sprite:Sprite, options:DeletedBlockOptions) {
  const commentedBlockIds = new Set();
  for(const comment of Object.values(sprite.comments||{})) {
    if(isID(comment.blockId)) commentedBlockIds.add(comment.blockId);
  }
  let deleteCount=0;
  const deleteGhostBlocks = options.deleteGhostBlocks || options.deleteInvisibleBlocks;
  const sus = /undefined|(?<!^procedures_)definition/;
  function isBlockValid({block}:BlockInfo):boolean {
    if(Array.isArray(block)) return true;
    if(!isObjectOrArray(block)) return false;
    if(options.deleteSuspiciousOpcodes && (!block.opcode || sus.test(block.opcode))) return false;
    if(options.deleteUnknownOpcodes && (!block.opcode || typeof OpcodeType==="object" && !(block.opcode in OpcodeType))) return false;
    return true;
  }
  function isBlockUsed(x:BlockInfo):boolean {
    const {block, id} = x;
    if(!isBlockValid(x)) return false;
    if(Array.isArray(block)) {
      if(options.deleteDisconnectedBlocks) return false;
      if(deleteGhostBlocks && block.length < 5) return false;
    }
    else {
      // Scratch treats procedures_definition differently, so it doesn't appear in the extracted hat block list but for our purposes it should count as a hat block
      if(options.deleteDisconnectedBlocks && block.opcode && typeof OpcodeType==="object" && OpcodeType[block.opcode]<options.deleteDisconnectedBlocks && block.opcode !== "procedures_definition" && !(isID(id) && commentedBlockIds.has(id)) && typeof block.comment!=="string") return false;
      // procedures_definition can also run if not marked as topLevel, so it doesn't count as a ghost block
      if(options.deleteGhostBlocks && !block.topLevel && (block.opcode !== "procedures_definition" || options.deleteInvisibleBlocks)) return false;
      if(block.shadow && (options.deleteInvisibleBlocks || options.deleteGhostBlocks && block.opcode && typeof OpcodeType==="object" && OpcodeType[block.opcode]<2 && block.opcode !== "procedures_defintion")) return false;
    }
    return true;
  }
  if(options.deleteDisconnectedBlocks || deleteGhostBlocks || options.deleteSuspiciousOpcodes || options.deleteUnknownOpcodes) {
    deleteCount += spagetti.deleteBlocksWithoutSatisfyingAncestor(isBlockUsed);
  }
  if(options.deleteSuspiciousOpcodes || options.deleteUnknownOpcodes) {
    // delete invalid opcodes found inside a block stack
    deleteCount += spagetti.deleteBlocksThatDontSatisfy(isBlockValid);
  }
  if(deleteCount>0) log(`${sprite.name}: deleted ${deleteCount} blocks that were unused or invalid`);
}

function unTopLevelifyReferencedBlocks(spagetti:BlockSpagetti) {
  let count = 0;
  const referenced = new Set<Block>();
  for(const {block} of spagetti.blocks()) {
    if(isMarkedTopLevel(block)) {
      spagetti.addDescendantsOfBlockToSet(block, referenced);
    }
  }
  for(const block of referenced) {
    if(Array.isArray(block)) {
      if(block.length>3) {block.length = 3; count+=1;}
    }
    else {
      if(block.topLevel) {block.topLevel = false; count+=1;}
    }
  }
  return count;
}

function doBlockFixes(spagetti: BlockSpagetti, sprite:Sprite, forbiddenIDs:Iterable<BlockId>, PREFIX:string, options:BlockFixOptions) {
  if(options.fillSemiOptionalProperties) {
    let count=0;
    for(const {block} of spagetti.blocks()) {
      if(!isJSONObject(block)) continue;
      if(!isID(block.next) && block.next!==null) {
        block.next=null;
        count+=1;
      }
      if(!isID(block.parent) && block.parent!==null) {
        block.parent=null;
        count+=1;
      }
      if(typeof block.topLevel !== "boolean") {
        block.topLevel = !!block.topLevel;
        count += 1;
      }
      if(typeof block.shadow !== "boolean") {
        block.shadow = !!block.shadow;
        count += 1;
      }
      if(!isJSONObject(block.fields)) {
        block.fields={};
        count+=1;
      }
      if(!isJSONObject(block.inputs)) {
        block.inputs={};
        count+=1;
      }
    }
    if(count>0) log(`${sprite.name}: added ${count} missing block parts`);
  }

  function getInputBlock(block:Block|undefined, iname:string) {
    if(!block || Array.isArray(block) || !isJSONObject(block.inputs)) return null;
    if(!(iname in block.inputs)) return null;
    const iarr=block.inputs[iname];
    if(!Array.isArray(iarr)) return null;
    let inputId=null;
    for(let i=1; i<iarr.length; i++) {
      if(isID(iarr[i])) {
        inputId = iarr[i];
        break;
      }
    }
    if(!isID(inputId) || !(inputId in spagetti.json)) return null;
    return spagetti.json[inputId];
  }

  if(options.copyCustomInputIdsFromDefinition || options.deleteDuplicateDefinitions) {
    const willBeDeleted = new Set<Pointer<Block>>;
    const firstPrototype = new Map<string, Mutation>();
    const firstDefinition = new Map<string, Mutation>();
    for(const {block, ptr, id} of spagetti.blocks()) {
      if(!isJSONObject(block)) continue;
      if(block.opcode === "procedures_prototype" && block.mutation?.proccode) {
        const proccode = block.mutation.proccode;
        if(firstPrototype.has(proccode)) continue;
        firstPrototype.set(proccode, block.mutation);
      }
      if(block.opcode === "procedures_definition") {
        const custom_block = getInputBlock(block,"custom_block");
        if(!Array.isArray(custom_block) && custom_block?.mutation?.proccode) {
          const proccode = custom_block.mutation.proccode;
          if(firstDefinition.has(proccode)) {
            if(options.deleteDuplicateDefinitions) {
              log(`${sprite.name}: deleting duplicate definition for ${proccode}`);
              // do the deletion later, as we might need to also find its procedures_prototype part
              willBeDeleted.add(ptr);
            }
            continue;
          }
          firstDefinition.set(proccode, custom_block.mutation);
        }
      }
    }
    for(const ptr of willBeDeleted) {
      spagetti.deleteBlock(ptr, true);
    }
    if(options.copyCustomInputIdsFromDefinition) {
      let count = 0;
      for(const {block} of spagetti.blocks()) {
        if(!isJSONObject(block)) continue;
        let changed=false;
        if(block.mutation && block.mutation.proccode) {
          const proto = firstPrototype.get(block.mutation.proccode);
          const def = firstDefinition.get(block.mutation.proccode);
          if(!proto) continue;
          if(block.opcode === "procedures_prototype") {
            if(block.mutation.argumentdefaults !== proto.argumentdefaults) {
              block.mutation.argumentdefaults = proto.argumentdefaults;
              changed=true;
            }
            if(def && block.mutation.warp !== def.warp) {
              block.mutation.warp = def.warp;
              changed = true;
            }
            if(block.mutation.argumentnames !== proto.argumentnames) {
              block.mutation.argumentnames = proto.argumentnames;
              changed = true;
            }
          }
          if(block.mutation.argumentids !== proto.argumentids) {
            block.mutation.argumentids = proto.argumentids;
            changed=true;
          }
        }
        if(changed) count+=1;
      }
      if(count>0) log(`${sprite.name}: changed ${count} custom blocks`);
    }
  }

  // should run after copyCustomInputIdsFromDefinition
  if(options.deleteInvalidCustomBlockInputs) {
    let count=0;
    for(const {block} of spagetti.blocks()) {
      if(Array.isArray(block)) continue;
      if(block.mutation && block.mutation.argumentids) {
        let argumentids;
        try {
          argumentids = new Set(JSON.parse(block.mutation.argumentids));
        } catch(err) {
          continue;
        }
        if(isJSONObject(block.inputs)) {
          const mightNeedDeleting = spagetti.forgetInFwdConnections(block);
          for(const [iname, iarr] of Object.entries(block.inputs)) {
            if(!argumentids.has(iname)) {
              delete block.inputs[iname];
              count+=1;
            }
          }
          spagetti.readdInFwdConnections(block, mightNeedDeleting);
        }
      }
    }
    if(count>0) log(`${sprite.name}: removed ${count} invalid custom block inputs`);
  }

  // should run after copyCustomInputIdsFromDefinition
  if(options.replaceCustomInputIds) {
    const forbiddenIDs = new Set<string>(); // empty set
    for(const {block} of spagetti.blocks()) {
      if(!isJSONObject(block)) continue;
      if(block.mutation && block.mutation.argumentids) {
        let argumentids=new Map();
        let idGenerator = prefixedIncrementalIDs("", forbiddenIDs);
        let newIdList = [];
        try {
          for(const x of JSON.parse(block.mutation.argumentids)) {
            const y=idGenerator.next().value;
            argumentids.set(x, y);
            newIdList.push(y);
          }
        } catch(err) {
          continue;
        }
        block.mutation.argumentids = JSON.stringify(newIdList);
        if(isJSONObject(block.inputs)) {
          const newInputs = Object.create(null);
          // order matters: this way if an unregistered ID happens to have the same inputID as 
          for(const [iname, iarr] of Object.entries(block.inputs)) {
            if(!argumentids.has(iname)) {
              newInputs[iname]=iarr;
            }
          }
          for(const [iname, iarr] of Object.entries(block.inputs)) {
            if(argumentids.has(iname)) { // this won't be undefined
              newInputs[argumentids.get(iname)]=iarr;
            }
          }
          const mightNeedDeleting = spagetti.forgetInFwdConnections(block);
          block.inputs = newInputs;
          spagetti.readdInFwdConnections(block, mightNeedDeleting);
        }
      }
    }
  }

  if(options.removeRedundantMutations) {
    let count=0;
    for(const {block} of spagetti.blocks()) {
      if(!isJSONObject(block)) continue;
      let changed = false;
      if(isJSONObject(block.mutation)) {
        // don't strip the mutation of unknown blocks, nor if the OpcodeType script didn't load
        if(!block.opcode || typeof OpcodeType==="object" && !(block.opcode in OpcodeType)) continue;
        const validProperties = new Set<keyof Mutation>(["tagName", "children"]); // Scratch doesn't let deleting these, even though they store no useful information :(
        switch(block.opcode) {
          case "procedures_prototype":
            validProperties.add("argumentnames");
            validProperties.add("argumentdefaults");
            validProperties.add("warp");
            // don't break - also add the properties of the procedures_call block
          case "procedures_call":
          case "procedures_declaration":
            validProperties.add("proccode");
            validProperties.add("argumentids");
            break;
          // don't add hasNext to the control_stop block, I think Scratch can figure out the mutation for that on its own
        }
        let hasValid = false;
        for(const key of Object.keys(block.mutation) as (keyof Mutation)[]) {
          if(!validProperties.has(key)) { delete block.mutation[key]; changed = true; }
          else hasValid = true;
        }
        if(!hasValid) {
          delete block.mutation;
          changed = true;
        }
      }
      else if(block.mutation) {
        log(`${sprite.name}: deleting weird invalid mutation`);
        delete block.mutation;
      }
      if(changed) count+=1;
    }
    if(count>0) log(`${sprite.name}: removed redundant things from ${count} mutations`);
  }

  if(options.cutInvalidReferences) {
    let count = 0;
    for(const {block} of spagetti.blocks()) {
      for(const pos of spagetti.idsInBlock(block)) {
        if(!pos.exists()) continue;
        let id = pos.read();
        if(isID(id) && !(id in spagetti.json) || !isID(id) && !isObjectOrArray(id) && id!==null) {
          pos.write(null);
          count += 1;
        }
      }
    }
    if(count>0) log(`${sprite.name}: cut ${count} invalid block references`);
  }

  function countBlockIds(spagetti:BlockSpagetti):Map<string, number> {
    const idUseCounts = new Map();
    
    function incrementCount(id:string) {
      const current = idUseCounts.get(id);
      idUseCounts.set(id, current ? current+1 : 1);
    }
    for(const {id, block} of spagetti.blocks()) {
      if(isID(id)) incrementCount(id);

      for(const pos of spagetti.idsInBlock(block)) {
        const id = pos.read();
        if(isID(id)) incrementCount(id);
      }
    }
    return idUseCounts;
  }

  if(options.splitDoublyReferencedBlocks) {
    let forbiddenNewIds = new Set<string>(forbiddenIDs);
    for(const id of countBlockIds(spagetti).keys()) forbiddenNewIds.add(id);
    const idGenerator = prefixedIncrementalIDs(PREFIX+"B", forbiddenNewIds);

    let splitCount = 0;
    const loopDetector = new Set<Block>();
    
    function splitBlock(block:Block) {
      if(loopDetector.has(block)) {
        throw new Error(`${sprite.name}: can't split double references: there is a reference loop among the blocks`);
      }
      loopDetector.add(block);
      let back = Array.from(spagetti.getReferencesTo(block));
      const allowedBackrefs = isMarkedTopLevel(block)?0:1;
      if(back.length>allowedBackrefs) {
        for(let i=allowedBackrefs; i<back.length; i++) {
          splitCount += 1;
          const altId = idGenerator.next().value;
          if(!isID(altId)) throw new Error("ID generator has been exhausted");
          const blockCopy = deepClone(block);
          if(isJSONObject(blockCopy) && blockCopy.topLevel) blockCopy.topLevel = false;
          spagetti.json[altId]=blockCopy;
          spagetti.blocksToIDs.set(blockCopy, altId);
          // TODO: optimize this so that it doesn't search all inputs of the referencer every time
          spagetti.forgetInFwdConnections(back[i].referencer);
          back[i].refPos.write(altId);
          spagetti.readdInFwdConnections(back[i].referencer, []);
          spagetti.readdInFwdConnections(blockCopy, []);
        }
        back.length=allowedBackrefs;
        for(const fwd of spagetti.getFwdRefs(block)) {
          if(fwd.block) splitBlock(fwd.block);
        }
      }
      loopDetector.delete(block);
    }
    for(const {block} of spagetti.blocks()) {
      splitBlock(block);
    }
    if(splitCount>0) log(`${sprite.name}: added ${splitCount} blocks by splitting doubly referenced blocks`);
  }

  if(options.repairParentReferences) {
    let count = 0;
    for(const {block} of spagetti.blocks()) {
      if(!isJSONObject(block)) continue;
      let parentIds = new Set<string>();
      for(const x of spagetti.getReferencers(block)) {
        const maybeId = spagetti.blocksToIDs.get(x.referencer);
        if(isID(maybeId)) {
          parentIds.add(maybeId);
          break;
        }
      }
      const parentReferencing = isID(block.parent) && parentIds.has(block.parent);
      const noParent = block.parent===null && parentIds.size===0;
      if(!parentReferencing && !noParent) {
        block.parent = parentIds.values().next().value??null;
        count += 1;
      }
    }
    if(count>0) log(`${sprite.name}: changed the "parent" info in ${count} blocks`);
  }
  
  if(options.replaceBlockIds) {
    const idUseCounts = countBlockIds(spagetti);
    const forbiddenNewIDs = new Set<string>(forbiddenIDs);

    const generator = prefixedIncrementalIDs(PREFIX+"B", forbiddenNewIDs);
    const replacements = new Map();
    let ids = Array.from(idUseCounts.entries()).sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
    for(const id of ids) {
      replacements.set(id, generator.next().value);
    }

    const newBlocks=Object.create(null);
    for(const {id, block} of spagetti.blocks()) {
      if(isID(id)) newBlocks[replacements.get(id)] = block;

      for(const pos of spagetti.idsInBlock(block)) {
        const old = pos.read();
        if(isID(old)) pos.write(replacements.get(old));
      }
    }
    sprite.blocks = spagetti.json = newBlocks;
    spagetti.recalculateThings();
  }
}