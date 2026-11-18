package org.agentfrc.lesson;
/** Six scalar velocities in a constrained longitudinal model, NOT a six-DOF rigid-body simulation. */
public final class MovingContact {
 public record Result(double[] velocity,double[] impulse,double lossJ,double projectionJ,double kktResidual){}
 private final double[] mass;private final double[][] jacobian,A;
 public MovingContact(double bodyMass,double pieceMass,double driveJ,double sleeveJ,double driveRadius,double sleeveRadius){
  if(!finite(bodyMass,1,100)||!finite(pieceMass,.1,2)||!finite(driveJ,.001,1)||!finite(sleeveJ,1e-5,1)||!finite(driveRadius,.01,.2)||!finite(sleeveRadius,.01,.2))throw new IllegalArgumentException("Moving model computational domain");
  mass=new double[]{bodyMass,pieceMass,driveJ,driveJ,sleeveJ,sleeveJ};jacobian=new double[][]{{-1,0,driveRadius,0,0,0},{-1,0,0,driveRadius,0,0},{1,-1,0,0,-sleeveRadius,0},{1,-1,0,0,0,sleeveRadius}};A=new double[4][4];for(int i=0;i<4;i++)for(int j=0;j<4;j++)for(int k=0;k<6;k++)A[i][j]+=jacobian[i][k]*jacobian[j][k]/mass[k];
 }
 private static boolean finite(double x,double lo,double hi){return Double.isFinite(x)&&x>=lo&&x<=hi;}
 public double kinetic(double[] q){double e=0;for(int k=0;k<6;k++)e+=.5*mass[k]*q[k]*q[k];return e;}
 public double momentum(double[] q){return mass[0]*q[0]+mass[1]*q[1];}
 public Result resolve(double[] q,double[] cap){if(q.length!=6||cap.length!=4)throw new IllegalArgumentException("State dimensions");for(int k=0;k<6;k++)if(!finite(q[k],k<2?-20:-2000,k<2?20:2000))throw new IllegalArgumentException("State domain");for(double c:cap)if(!finite(c,0,1))throw new IllegalArgumentException("Impulse bound");
  double[] slip=new double[4];for(int i=0;i<4;i++)for(int k=0;k<6;k++)slip[i]+=jacobian[i][k]*q[k];double best=Double.POSITIVE_INFINITY;double[] p=null;
  for(int choice=0;choice<81;choice++){int z=choice,n=0;int[] free=new int[4];double[] trial=new double[4];for(int i=0;i<4;i++){int t=z%3-1;z/=3;if(t==0)free[n++]=i;else trial[i]=t*cap[i];}
   double[][] matrix=new double[n][n+1];for(int i=0;i<n;i++){int row=free[i];double rhs=slip[row];for(int j=0;j<4;j++)rhs-=A[row][j]*trial[j];for(int j=0;j<n;j++)matrix[i][j]=A[row][free[j]];matrix[i][n]=rhs;}
   for(int i=0;i<n;i++){double pivot=matrix[i][i];if(!Double.isFinite(pivot)||pivot<=1e-12)throw new IllegalStateException("SPD solve");for(int j=i;j<=n;j++)matrix[i][j]/=pivot;for(int row=0;row<n;row++)if(row!=i){double factor=matrix[row][i];for(int j=i;j<=n;j++)matrix[row][j]-=factor*matrix[i][j];}}
   for(int i=0;i<n;i++)trial[free[i]]=matrix[i][n];boolean feasible=true;for(int i=0;i<4;i++){if(Math.abs(trial[i])>cap[i]+1e-12)feasible=false;trial[i]=Math.max(-cap[i],Math.min(cap[i],trial[i]));}if(!feasible)continue;double value=0;for(int i=0;i<4;i++){value-=slip[i]*trial[i];for(int j=0;j<4;j++)value+=.5*trial[i]*A[i][j]*trial[j];}if(value<best){best=value;p=trial;}}
  if(p==null)throw new IllegalStateException("No feasible impulse");double[] next=q.clone();for(int k=0;k<6;k++)for(int i=0;i<4;i++)next[k]-=jacobian[i][k]*p[i]/mass[k];double projection=0,work=0,residual=0,sliding=0;for(int i=0;i<4;i++){double post=slip[i];work+=p[i]*slip[i];for(int j=0;j<4;j++){projection+=.5*p[i]*A[i][j]*p[j];post-=A[i][j]*p[j];}sliding+=p[i]*post;if(cap[i]>0){double tol=Math.min(1e-10,cap[i]*1e-6),g=-post;residual=Math.max(residual,Math.abs(p[i]+cap[i])<=tol?Math.max(0,-g):Math.abs(p[i]-cap[i])<=tol?Math.max(0,g):Math.abs(g));}}
  double loss=work-projection;if(residual>1e-8||loss< -1e-9||sliding< -1e-9||Math.abs(kinetic(q)-kinetic(next)-loss)>1e-7)throw new IllegalStateException("Contact audit");return new Result(next,p,loss,projection,residual);
 }
}
