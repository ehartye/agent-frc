// Millimetre plan sketches for import on the Fusion XY construction plane.
export function frameDxf(plan) {
  const records=[];
  const add=(...pairs)=>records.push(...pairs);
  add(0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1015',9,'$INSUNITS',70,4,0,'ENDSEC');
  add(0,'SECTION',2,'TABLES',0,'TABLE',2,'LAYER',70,4);
  for(const [i,name] of Object.keys(plan.layerLoops).entries())
    add(0,'LAYER',100,'AcDbSymbolTableRecord',100,'AcDbLayerTableRecord',2,name,70,0,62,[7,2,5,3][i],6,'CONTINUOUS');
  add(0,'ENDTAB',0,'ENDSEC',0,'SECTION',2,'ENTITIES');
  for(const [name,vertices] of Object.entries(plan.layerLoops)){
    add(0,'LWPOLYLINE',100,'AcDbEntity',8,name,100,'AcDbPolyline',90,vertices.length,70,1);
    for(const [x,y] of vertices)add(10,x*1000,20,y*1000);
  }
  add(0,'ENDSEC',0,'EOF');
  return records.join('\n')+'\n';
}
