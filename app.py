# app.py
from flask import Flask, render_template, request, jsonify
import numpy as np
from scipy.linalg import solve
from math import pi, sqrt
import json

app = Flask(__name__)

class SteelBeamCalculator:
    def __init__(self, length, supports, loads, beam_type="Square Bar", material="Steel", section_props=None):
        self.length = float(length)
        self.supports = supports
        self.loads = loads
        self.beam_type = beam_type
        self.material = material
        self.section_props = section_props or {}
        
        # Material properties (MPa)
        if material == "Steel":
            self.E = 205000  # MPa
        elif material == "Aluminum":
            self.E = 69000
        else:  # Stainless Steel
            self.E = 193000
            
        # Use section properties if provided, otherwise use default 50x50mm square bar
        if self.section_props:
            self.Ix = self.section_props.get('Ix', self.section_props.get('ix', 520833.33))
            self.Iy = self.section_props.get('Iy', self.section_props.get('iy', 520833.33))
            self.A = self.section_props.get('area', 2500)
        else:
            self.Ix = 520833.33  # mm^4 (bh^3/12 for 50x50)
            self.Iy = 520833.33  # mm^4 (symmetric)
            self.A = 2500  # mm^2
        
    def solve_beam_direction(self, direction='vertical'):
        """Solve beam using matrix stiffness method for specified direction"""
        # Select moment of inertia based on direction
        if direction == 'vertical':
            I = self.Ix  # Bending about major axis (x-axis)
        elif direction == 'transverse':
            I = self.Iy  # Bending about minor axis (y-axis)
        else:
            return None
            
        # Number of elements for analysis
        num_elements = 100
        element_length = self.length / num_elements
        num_nodes = num_elements + 1
        
        # Degrees of freedom per node: [displacement, rotation]
        total_dof = 2 * num_nodes
        
        # Initialize global stiffness matrix and force vector
        K_global = np.zeros((total_dof, total_dof))
        F_global = np.zeros(total_dof)
        
        # Assemble global stiffness matrix
        for i in range(num_elements):
            L = element_length
            EI = self.E * I
            
            # Exact beam element stiffness matrix
            k_element = np.array([
                [12, 6*L, -12, 6*L],
                [6*L, 4*L**2, -6*L, 2*L**2],
                [-12, -6*L, 12, -6*L],
                [6*L, 2*L**2, -6*L, 4*L**2]
            ]) * (EI / L**3)
            
            # Assemble into global matrix
            dof_indices = [2*i, 2*i+1, 2*(i+1), 2*(i+1)+1]
            for m in range(4):
                for n in range(4):
                    K_global[dof_indices[m], dof_indices[n]] += k_element[m, n]
        
        # Apply loads to force vector (only loads matching the direction)
        for load in self.loads:
            load_type = load.get('type', 'point load')
            magnitude = float(load['magnitude'])
            position = float(load['position'])
            load_direction = load.get('direction', 'vertical')
            
            # Skip loads that don't match this analysis direction
            if load_direction != direction:
                continue
            
            if load_type == 'point load':
                # Find the element containing the load
                element_idx = int(np.floor(position / element_length))
                element_idx = min(element_idx, num_elements - 1)
                
                # Local coordinate within element (0 to 1)
                a = position - element_idx * element_length
                L = element_length
                
                # Shape functions for equivalent nodal forces
                P = magnitude
                F1 = -P * (1 - 3*a**2/L**2 + 2*a**3/L**3)
                M1 = -P * (a - 2*a**2/L + a**3/L**2)
                F2 = -P * (3*a**2/L**2 - 2*a**3/L**3)
                M2 = -P * (-a**2/L + a**3/L**2)
                
                # Add to global force vector
                dof_indices = [2*element_idx, 2*element_idx+1, 2*(element_idx+1), 2*(element_idx+1)+1]
                F_global[dof_indices[0]] += F1
                F_global[dof_indices[1]] += M1
                F_global[dof_indices[2]] += F2
                F_global[dof_indices[3]] += M2
                
            elif load_type == 'moment':
                # Moment load
                element_idx = int(np.floor(position / element_length))
                element_idx = min(element_idx, num_elements - 1)
                a = position - element_idx * element_length
                L = element_length
                M = magnitude
                
                # Equivalent nodal forces for moment
                F1 = 0
                M1 = M * (1 - 3*a**2/L**2 + 2*a**3/L**3)
                F2 = 0
                M2 = M * (3*a**2/L**2 - 2*a**3/L**3)
                
                dof_indices = [2*element_idx, 2*element_idx+1, 2*(element_idx+1), 2*(element_idx+1)+1]
                F_global[dof_indices[1]] += M1
                F_global[dof_indices[3]] += M2
                
            elif load_type == 'uniform distributed load':
                start_pos = position
                end_pos = start_pos + float(load.get('length', self.length - start_pos))
                w = magnitude  # kN/m
                
                # Find elements affected by UDL
                start_element = int(np.floor(start_pos / element_length))
                end_element = int(np.ceil(end_pos / element_length))
                start_element = max(0, min(start_element, num_elements - 1))
                end_element = max(0, min(end_element, num_elements))
                
                for e in range(start_element, end_element):
                    element_start = e * element_length
                    element_end = (e + 1) * element_length
                    
                    # Overlap of UDL with this element
                    seg_start = max(start_pos, element_start)
                    seg_end = min(end_pos, element_end)
                    seg_length = seg_end - seg_start
                    
                    if seg_length > 0:
                        # Local coordinate of segment within element
                        a = seg_start - element_start
                        b = seg_end - element_start
                        L = element_length
                        
                        # Equivalent nodal forces for partial UDL
                        F1 = -w * (b - a) * (1 - (a+b)/(2*L))
                        M1 = -w * ((b**3 - a**3)/(3*L**2) - (b**2 - a**2)/(2*L))
                        F2 = -w * (b - a) * ((a+b)/(2*L))
                        M2 = w * ((b**3 - a**3)/(3*L**2) - (b**2 - a**2)/(2*L))
                        
                        dof_indices = [2*e, 2*e+1, 2*(e+1), 2*(e+1)+1]
                        F_global[dof_indices[0]] += F1
                        F_global[dof_indices[1]] += M1
                        F_global[dof_indices[2]] += F2
                        F_global[dof_indices[3]] += M2
        
        # Apply boundary conditions
        constrained_dofs = []
        for support in self.supports:
            position = float(support['position'])
            support_type = support['type']
            
            # Find node at support position
            node_idx = int(round(position / element_length))
            node_idx = max(0, min(node_idx, num_nodes - 1))
            
            if support_type in ['pinned', 'roller', 'fixed']:
                constrained_dofs.append(2*node_idx)  # v = 0
                
            if support_type in ['fixed']:
                constrained_dofs.append(2*node_idx + 1)  # θ = 0
        
        constrained_dofs = list(set(constrained_dofs))
        free_dofs = [i for i in range(total_dof) if i not in constrained_dofs]
        
        # Solve for displacements
        if len(free_dofs) > 0:
            K_reduced = K_global[np.ix_(free_dofs, free_dofs)]
            F_reduced = F_global[free_dofs]
            
            try:
                displacements_reduced = solve(K_reduced, F_reduced)
            except np.linalg.LinAlgError:
                displacements_reduced = np.linalg.lstsq(K_reduced, F_reduced, rcond=None)[0]
            
            displacements = np.zeros(total_dof)
            for i, dof in enumerate(free_dofs):
                displacements[dof] = displacements_reduced[i]
        else:
            displacements = np.zeros(total_dof)
        
        # Calculate reactions
        reactions = K_global @ displacements - F_global
        
        # Calculate shear force and bending moment along the beam
        x_coords = []
        shear_forces = []
        bending_moments = []
        
        # For accurate diagrams, sample at many points within each element
        samples_per_element = 20
        
        for i in range(num_elements):
            L = element_length
            EI = self.E * I
            
            # Get element nodal displacements
            v1 = displacements[2*i]
            θ1 = displacements[2*i+1]
            v2 = displacements[2*(i+1)]
            θ2 = displacements[2*(i+1)+1]
            
            # Calculate distributed loads on this element (matching this direction)
            w_element = 0
            for load in self.loads:
                if load.get('type') == 'uniform distributed load' and load.get('direction') == direction:
                    start_pos = float(load['position'])
                    end_pos = start_pos + float(load.get('length', self.length - start_pos))
                    element_start = i * L
                    element_end = (i + 1) * L
                    
                    if end_pos > element_start and start_pos < element_end:
                        w_element += float(load['magnitude'])
            
            # Sample points within element
            for s in range(samples_per_element + 1):
                x_local = s * L / samples_per_element
                x_global = i * L + x_local
                
                # Shape functions for beam element (Hermitian interpolation)
                xi = x_local / L
                N1 = 1 - 3*xi**2 + 2*xi**3
                N2 = L * (xi - 2*xi**2 + xi**3)
                N3 = 3*xi**2 - 2*xi**3
                N4 = L * (-xi**2 + xi**3)
                
                # Curvature: d²v/dx² = B1*v1 + B2*θ1 + B3*v2 + B4*θ2
                B1 = (6 - 12*xi) / L**2
                B2 = (4 - 6*xi) / L
                B3 = (-6 + 12*xi) / L**2
                B4 = (2 - 6*xi) / L
                
                curvature = B1*v1 + B2*θ1 + B3*v2 + B4*θ2
                
                # Bending moment: M = EI * curvature
                M = -EI * curvature
                
                # Shear force: V = dM/dx
                dB1 = -12 / L**3
                dB2 = -6 / L**2
                dB3 = 12 / L**3
                dB4 = -6 / L**2
                
                dcurvature = dB1*v1 + dB2*θ1 + dB3*v2 + dB4*θ2
                V = -EI * dcurvature
                
                # Add contribution from distributed loads
                # For a uniformly distributed load, we need to add back the distributed portion
                # that's not captured by the nodal displacement-based calculation
                if w_element != 0:
                    # Shear varies linearly across element
                    V_udl = -w_element * (x_local - L/2)
                    # For moment: integrate shear from element loads
                    # Moment from UDL as if cutting at x_local
                    M_udl = -w_element * x_local**2 / 2
                    V += V_udl
                    M += M_udl
                
                x_coords.append(x_global)
                shear_forces.append(V)
                bending_moments.append(M)
        
        # Calculate deflection at nodes
        deflections = [displacements[2*i] for i in range(num_nodes)]
        x_deflection = [i * element_length for i in range(num_nodes)]
        
        return {
            'x_coords': x_coords,
            'shear_forces': shear_forces,
            'bending_moments': bending_moments,
            'x_deflection': x_deflection,
            'deflections': deflections,
            'displacements': displacements,
            'reactions': reactions,
            'num_nodes': num_nodes,
            'element_length': element_length,
            'num_elements': num_elements
        }
    
    def solve_beam(self):
        """Solve beam for both vertical and transverse directions"""
        # Solve for vertical direction (major axis bending)
        results_vertical = self.solve_beam_direction('vertical')
        
        # Solve for transverse direction (minor axis bending)
        results_transverse = self.solve_beam_direction('transverse')
        
        # Combine results
        return {
            'vertical': results_vertical,
            'transverse': results_transverse
        }
    
    def calculate_reactions_summary(self, results):
        """Extract support reactions from results (both vertical and transverse)"""
        reactions_summary = []
        
        results_v = results.get('vertical', {})
        results_t = results.get('transverse', {})
        element_length_v = results_v.get('element_length', 0)
        element_length_t = results_t.get('element_length', 0)
        
        for support in self.supports:
            position = float(support['position'])
            support_type = support['type']
            
            # Find node at support position for vertical direction
            node_idx_v = int(round(position / element_length_v)) if element_length_v > 0 else 0
            node_idx_v = max(0, min(node_idx_v, results_v.get('num_nodes', 1) - 1))
            
            # Find node at support position for transverse direction
            node_idx_t = int(round(position / element_length_t)) if element_length_t > 0 else 0
            node_idx_t = max(0, min(node_idx_t, results_t.get('num_nodes', 1) - 1))
            
            # Get reaction forces (negative of internal forces at support)
            # Vertical direction: Fy (vertical) and Mz (moment about z-axis)
            Fy = 0
            Mz = 0
            if results_v and 'reactions' in results_v:
                Fy = -results_v['reactions'][2*node_idx_v]
                Mz = -results_v['reactions'][2*node_idx_v + 1]
            
            # Transverse direction: Fz (transverse) and My (moment about y-axis)
            Fz = 0
            My = 0
            if results_t and 'reactions' in results_t:
                Fz = -results_t['reactions'][2*node_idx_t]
                My = -results_t['reactions'][2*node_idx_t + 1]
            
            # Convert from N to kN, and N·mm to kN·m
            reactions_summary.append({
                'support_id': len(reactions_summary) + 1,
                'position': round(position / 1000, 2),  # mm to m for frontend display
                'type': support_type,
                'Fx': 0,  # Axial handled separately
                'Fy': round(Fy / 1000, 2),  # N to kN (vertical)
                'Fz': round(Fz / 1000, 2),  # N to kN (transverse)
                'Mx': 0,
                'My': round(My / 1e6, 2),  # N·mm to kN·m (about y-axis)
                'Mz': round(Mz / 1e6, 2)   # N·mm to kN·m (about z-axis)
            })
        
        return reactions_summary
    
    def calculate_member_forces(self, results):
        """Calculate maximum member forces from both vertical and transverse directions"""
        results_v = results.get('vertical', {})
        results_t = results.get('transverse', {})
        
        # Vertical direction (major axis)
        shear_forces_v = results_v.get('shear_forces', [])
        bending_moments_v = results_v.get('bending_moments', [])
        deflections_v = results_v.get('deflections', [])
        
        # Transverse direction (minor axis)
        shear_forces_t = results_t.get('shear_forces', [])
        bending_moments_t = results_t.get('bending_moments', [])
        deflections_t = results_t.get('deflections', [])
        
        # Calculate axial force from axial loads
        axial_force = 0
        for load in self.loads:
            if load.get('direction') == 'axial':
                axial_force += float(load['magnitude'])
        
        # Find maximum absolute values for vertical direction
        max_shear_v = max(abs(min(shear_forces_v)), abs(max(shear_forces_v))) if shear_forces_v else 0
        max_moment_v = max(abs(min(bending_moments_v)), abs(max(bending_moments_v))) if bending_moments_v else 0
        max_deflection_v = abs(max(deflections_v, key=abs)) if deflections_v else 0
        
        # Find maximum absolute values for transverse direction
        max_shear_t = max(abs(min(shear_forces_t)), abs(max(shear_forces_t))) if shear_forces_t else 0
        max_moment_t = max(abs(min(bending_moments_t)), abs(max(bending_moments_t))) if bending_moments_t else 0
        max_deflection_t = abs(max(deflections_t, key=abs)) if deflections_t else 0
        
        # Convert from N to kN, and N·mm to kN·m for display
        return {
            'axial_force': round(axial_force / 1000, 2),  # N to kN
            'shear_major': round(max_shear_v / 1000, 2),  # N to kN (vertical/major axis)
            'shear_minor': round(max_shear_t / 1000, 2),  # N to kN (transverse/minor axis)
            'torsion': 0,
            'bending_major': round(max_moment_v / 1e6, 2),  # N·mm to kN·m (about major axis)
            'bending_minor': round(max_moment_t / 1e6, 2),  # N·mm to kN·m (about minor axis)
            'max_deflection': round(max_deflection_v, 3),  # Already in mm (vertical)
            'max_deflection_transverse': round(max_deflection_t, 3)  # Already in mm (transverse)
        }

class SteelBeamChecker:
    """Steel beam checker for BS5950 and COP HK standards"""
    
    def __init__(self, section_props, beam_type, support_condition, beam_purpose, material_props, member_forces, beam_length, has_cantilever_part=False):
        """
        Initialize steel beam checker
        
        Args:
            section_props: dict with section properties (area, Ix, Iy, Zx, Zy, Sx, Sy, rx, ry, J, etc.)
            beam_type: str - "Hbeam", "Ibeam", "PFC", "RHS", "SHS", "CHS", "EA", "UA", "Box"
            support_condition: str - "simply supported", "fixed", "cantilever"
            beam_purpose: str - "general" or "crane"
            material_props: dict with E, py (design strength)
            member_forces: dict with axial_force, shear_major, shear_minor, torsion, bending_major, bending_minor
            has_cantilever_part: bool - True when any overhang/cantilever part exists
        """
        self.section_props = section_props
        self.beam_type = beam_type
        self.support_condition = support_condition
        self.beam_purpose = beam_purpose
        self.has_cantilever_part = has_cantilever_part
        self.material_props = material_props
        self.member_forces = member_forces
        
        if self.beam_type == "Hbeam" or self.beam_type == "Ibeam" or self.beam_type == "PFC":
            self.D = section_props.get('h', 0)  # height/depth
            self.B = section_props.get('b', 0)  # width
            self.T = section_props.get('tf', 0)  # flange thickness
            self.t = section_props.get('tw', 0)  # web thickness
            self.ro = section_props.get('r', 0)  # root radius
            self.A = section_props.get('area', 0)
            self.Iy = section_props.get('iy', 0)
            self.Iz = section_props.get('ix', 0)
            self.Zy = section_props.get('zey', 0)
            self.Zz = section_props.get('zex', 0)
            self.Sy = section_props.get('zpy', 0)
            self.Sz = section_props.get('zpx', 0)
            self.ry = section_props.get('ry', 0)
            self.rz = section_props.get('rx', 0)
            self.J = section_props.get('j', 0)
            print(f"DEBUG Section props: D={self.D}mm, B={self.B}mm, A={self.A}mm², Sz={self.Sz}mm³, Zz={self.Zz}mm³, ry={self.ry}mm, rz={self.rz}mm")
        
        elif self.beam_type == "SHS" or self.beam_type == "RHS":
            self.D = section_props.get('h', 0)  # height/depth
            self.B = section_props.get('b', 0)  # width
            self.t = section_props.get('t', 0)  # wall thickness
            self.A = section_props.get('area', 0)
            self.Iy = section_props.get('iy', 0)
            self.Iz = section_props.get('ix', 0)
            self.Zy = section_props.get('zey', 0)
            self.Zz = section_props.get('zex', 0)
            self.Sy = section_props.get('zpy', 0)
            self.Sz = section_props.get('zpx', 0)
            self.ry = section_props.get('ry', 0)
            self.rz = section_props.get('rx', 0)
            self.J = section_props.get('j', 0)
            self.d = self.D - (5 * self.t)  # Internal depth
            self.b = self.B - (5 * self.t)  # Internal width

        elif self.beam_type == "CHS":
            self.D = section_props.get('d', 0)  # OD
            self.t = section_props.get('t', 0)  # wall thickness
            self.A = section_props.get('area', 0)
            self.Iy = section_props.get('iy', 0)
            self.Iz = section_props.get('ix', 0)
            self.Zy = section_props.get('zey', 0)
            self.Zz = section_props.get('zex', 0)
            self.Sy = section_props.get('zpy', 0)
            self.Sz = section_props.get('zpx', 0)
            self.ry = section_props.get('ry', 0)
            self.rz = section_props.get('rx', 0)
            self.J = section_props.get('j', 0)

        elif self.beam_type == "EA" or self.beam_type == "UA":
            self.D = section_props.get('h', 0)  # height/depth
            self.B = section_props.get('b', 0)  # width
            self.t = section_props.get('tw', 0)  # wall thickness
            self.A = section_props.get('area', 0)
            self.Iy = section_props.get('iy', 0)
            self.Iz = section_props.get('ix', 0)
            self.Zy = section_props.get('zey', 0)
            self.Zz = section_props.get('zex', 0)
            self.Sy = section_props.get('zpy', 0)
            self.Sz = section_props.get('zpx', 0)
            self.ry = section_props.get('ry', 0)
            self.rz = section_props.get('rx', 0)
            self.J = section_props.get('j', 0)
            self.T = self.t  # For angles, thickness is same for both legs

        # Extract material properties
        self.E = material_props.get('E', 205000)
        self.py = material_props.get('py', 275)
        
        self.L = beam_length
        
        # Extract member forces (convert to appropriate units)
        self.axial_force = abs(member_forces.get('axial_force', 0))  # kN
        self.shear_y = abs(member_forces.get('shear_major', 0))  # kN
        self.shear_z = abs(member_forces.get('shear_minor', 0))  # kN
        self.torsion = abs(member_forces.get('torsion', 0))  # kN-m
        self.moment_y = abs(member_forces.get('bending_minor', 0))  # kN-m 
        self.moment_z = abs(member_forces.get('bending_major', 0))  # kN-m
        
        print(f"DEBUG Member forces passed to checker: shear_y={self.shear_y}kN, moment_z={self.moment_z}kN·m, axial={self.axial_force}kN")
        
        # Adjust design strength based on thickness if applicable
        self._adjust_design_strength()
        
        # Effective length factor based on support condition and beam purpose
        self._set_effective_length_factor()
        
        # Initialize results storage
        self.results = {}
        
    def _adjust_design_strength(self):
        """Adjust design strength based on flange/web thickness"""
        max_thickness = max(self.T, self.t)
        reduction = 0
        if max_thickness >= 16 and max_thickness < 40:
            reduction = 10
        elif max_thickness >= 40 and max_thickness < 63:
            reduction = 20
        elif max_thickness >= 63 and max_thickness < 80:
            reduction = 30
        elif max_thickness >= 80 and max_thickness < 100:
            reduction = 40
        self.py = self.material_props.get('py', 275) - reduction
    
    def _set_effective_length_factor(self):
        """Set effective length factor based on support condition and beam purpose"""
        support_factors = {
            "simply supported": 1.2,
            "fixed": 1.0,
            "cantilever": 3.0
        }
        self.Cb = support_factors.get(self.support_condition, 1.2)
    
    def _get_ep(self):
        """Get epsilon factor for section classification"""
        return sqrt(275 / self.py)
    
    def classify_section(self):
        """Classify section based on BS5950"""
        ep = self._get_ep()
        section_class = 4  # Default to Class 4
        reduction_factor = 1.0
        
        if self.beam_type in ["Hbeam","Ibeam", "PFC", "EA", "UA"]:
            # Calculate ratios based on beam type
            if self.beam_type in ["Hbeam", "Ibeam", "PFC"]:
                d = self.D - (2 * self.T + 2 * self.ro) if self.ro else self.D - (2 * self.T)
                b = self.B / 2
                ratio_flange = b / self.T if self.T else 999
                ratio_web = d / self.t if self.t else 999
            else:  # EA
                d = self.D - (self.T + self.ro) if self.ro else self.D - self.T
                b = self.B
                ratio_flange = b / self.T if self.T else 999
                ratio_web = d / self.T if self.T else 999
            
            # Flange classification
            if ratio_flange <= 9 * ep:
                class_flange = 1
            elif ratio_flange <= 10 * ep:
                class_flange = 2
            elif ratio_flange <= 14 * ep:
                class_flange = 3
            else:
                class_flange = 4
                reduction_factor = min(reduction_factor, 14 * ep / ratio_flange)
            
            # Web classification
            if self.beam_type in ["Hbeam", "Ibeam"]:
                if ratio_web <= 80 * ep:
                    class_web = 1
                elif ratio_web <= 100 * ep:
                    class_web = 2
                elif ratio_web <= 120 * ep:
                    class_web = 3
                else:
                    class_web = 4
                    reduction_factor = min(reduction_factor, 120 * ep / ratio_web)
            elif self.beam_type == "PFC":
                class_web = 1 if ratio_web <= 40 * ep else 4
                if class_web == 4:
                    reduction_factor = min(reduction_factor, 40 * ep / ratio_web)
            else:  # EA
                if ratio_web <= 9 * ep:
                    class_web = 1
                elif ratio_web <= 10 * ep:
                    class_web = 2
                elif ratio_web <= 15 * ep:
                    class_web = 3
                else:
                    class_web = 4
                    reduction_factor = min(reduction_factor, 15 * ep / ratio_web)
            
            section_class = max(class_flange, class_web)
            
        elif self.beam_type in ["RHS", "SHS"]:
            d = self.D - (5 * self.t)
            b = self.B - (5 * self.t)
            ratio_flange = b / self.t if self.t else 999
            ratio_web = d / self.t if self.t else 999
            
            # Flange classification
            if ratio_flange <= 28 * ep:
                class_flange = 1
            elif ratio_flange <= 32 * ep:
                class_flange = 2
            elif ratio_flange <= 40 * ep:
                class_flange = 3
            else:
                class_flange = 4
                reduction_factor = min(reduction_factor, 40 * ep / ratio_flange)
            
            # Web classification
            if ratio_web <= 64 * ep:
                class_web = 1
            elif ratio_web <= 80 * ep:
                class_web = 2
            elif ratio_web <= 120 * ep:
                class_web = 3
            else:
                class_web = 4
                reduction_factor = min(reduction_factor, 120 * ep / ratio_web)
            
            section_class = max(class_flange, class_web)
            
        elif self.beam_type == "CHS":
            ratio = self.D / self.t if self.t else 999
            if ratio <= 40 * ep**2:
                section_class = 1
            elif ratio <= 50 * ep**2:
                section_class = 2
            elif ratio <= 140 * ep**2:
                section_class = 3
            else:
                section_class = 4
                reduction_factor = 140 * ep**2 / ratio
        
        self.results['section_class'] = section_class
        self.results['reduction_factor'] = reduction_factor
        return section_class, reduction_factor
    
    def check_shear_capacity(self):
        """Check shear capacity based on BS5950"""
        # Calculate shear capacities (kN)
        if self.beam_type in ["Hbeam", "Ibeam", "PFC"]:
            shear_capacity_y = self.py * self.t * self.D * 0.001 / sqrt(3)
            shear_capacity_z = self.py * 2 * 0.9 * self.T * self.B * 0.001 / sqrt(3)
        elif self.beam_type == "EA":
            shear_capacity_y = self.py * self.t * self.D * 0.001 / sqrt(3)
            shear_capacity_z = self.py * self.B * self.T * 0.001 / sqrt(3)
        elif self.beam_type in ["RHS", "SHS"]:
            d = self.D - (5 * self.t)
            b = self.B - (5 * self.t)
            shear_capacity_y = self.py * 2 * self.t * d * 0.001 / sqrt(3)
            shear_capacity_z = self.py * 2 * self.T * b * 0.001 / sqrt(3)
        elif self.beam_type == "CHS":
            shear_capacity_y = shear_capacity_z = self.py * self.A * 0.001 / sqrt(3)
        else:
            shear_capacity_y = shear_capacity_z = 0
        
        # Utilization ratios
        ur_shear_y = self.shear_y / shear_capacity_y if shear_capacity_y else 999
        ur_shear_z = self.shear_z / shear_capacity_z if shear_capacity_z else 999
        
        self.results['shear_capacity_y'] = round(shear_capacity_y, 1)
        self.results['shear_capacity_z'] = round(shear_capacity_z, 1)
        self.results['ur_shear_y'] = round(ur_shear_y, 2)
        self.results['ur_shear_z'] = round(ur_shear_z, 2)
        self.results['shear_y_ok'] = bool(ur_shear_y <= 1.0)
        self.results['shear_z_ok'] = bool(ur_shear_z <= 1.0)
        
        return ur_shear_y, ur_shear_z
    
    def check_moment_capacity(self, ur_shear_y, ur_shear_z):
        """Check moment capacity with shear interaction"""
        
        section_class = self.results.get('section_class', 3)
        reduction_factor = self.results.get('reduction_factor', 1.0)

        if ur_shear_y > 0.6:
            print(f"Shear force in y direction exceeds 60% of shear capacity. High Shear Condition.")
            rho = ((2 * ur_shear_y) - 1) ** 2
            
            # Calculate plastic shear modulus (Sv)
            if self.beam_type in ["Hbeam", "Ibeam", "PFC", "EA", "UA", "Box"]:
                Sv = self.t * self.D * self.D / 4
            elif self.beam_type in ["RHS", "SHS"]:
                Sv = 2 * self.t * self.d * self.d / 4
            elif self.beam_type == "CHS":
                Sv = pi * self.t * self.t * (self.D / 2 - self.t)
            
            # Calculate moment capacity for high shear
            if section_class in [1, 2]:
                moment_capacity_y = min(self.py * (self.Sy - rho * Sv) / 1000000, 
                        1.2 * self.py * (self.Zy - rho * Sv / 1.5) / 1000000)
            elif section_class == 3:
                moment_capacity_y = self.py * (self.Zy - rho * Sv / 1.5) / 1000000
            elif section_class == 4:
                pyr = reduction_factor ** 2 * self.py
                moment_capacity_y = pyr * (self.Zy - rho * Sv / 1.5) / 1000000
        else:
            print(f"Shear force in y direction is within shear capacity. Low Shear Condition.")
            if section_class in [1, 2]:
                moment_capacity_y = min(self.py * self.Sy / 1000000, 1.2 * self.py * self.Zy / 1000000)
                print(f"DEBUG Class 1/2 moment capacity calc: Sy={self.Sy}mm³, Zy={self.Zy}mm³, 1.2*Sy*py/1e6={1.2*self.py*self.Sy/1e6}kN·m, Zy*py/1e6={self.py*self.Zy/1e6}kN·m")
            elif section_class == 3:
                moment_capacity_y = self.py * self.Zy / 1000000
            elif section_class == 4:
                pyr = reduction_factor ** 2 * self.py
                moment_capacity_y = pyr * self.Zy / 1000000
            
        if ur_shear_z > 0.6:
            print(f"Shear force in z direction exceeds 60% of shear capacity. High Shear Condition.")
            rho = ((2 * ur_shear_z) - 1) ** 2
            
            # Calculate plastic shear modulus (Sv)
            if self.beam_type in ["Hbeam", "Ibeam", "PFC", "Box"]:
                Sv = self.T * self.B * self.B * 2 / 4
            elif self.beam_type in ["EA", "UA"]:
                Sv = self.t * self.B * self.B / 4
            elif self.beam_type in ["RHS", "SHS"]:
                Sv = 2 * self.t * self.b * self.b / 4
            elif self.beam_type == "CHS":
                Sv = pi * self.t * self.t * (self.D / 2 - self.t)
            
            # Calculate moment capacity for high shear
            if section_class in [1, 2]:
                moment_capacity_z = min(self.py * (self.Sz - rho * Sv) / 1000000, 
                        1.2 * self.py * (self.Zz - rho * Sv / 1.5) / 1000000)
            elif section_class == 3:
                moment_capacity_z = self.py * (self.Zz - rho * Sv / 1.5) / 1000000
            elif section_class == 4:
                pyr = reduction_factor ** 2 * self.py
                moment_capacity_z = pyr * (self.Zz - rho * Sv / 1.5) / 1000000
        else:
            print(f"Shear force in z direction is within shear capacity. Low Shear Condition.")
            if section_class in [1, 2]:
                moment_capacity_z = min(self.py * self.Sz / 1000000, 1.2 * self.py * self.Zz / 1000000)
            elif section_class == 3:
                moment_capacity_z = self.py * self.Zz / 1000000
            elif section_class == 4:
                pyr = reduction_factor ** 2 * self.py
                moment_capacity_z = pyr * self.Zz / 1000000
        
        print(f"DEBUG Moment capacity calc: py={self.py}MPa, Sz={self.Sz}mm³, Sz*py/1e6={self.py*self.Sz/1e6}kN·m, Zz={self.Zz}mm³, Zz*py/1e6={self.py*self.Zz/1e6}kN·m")
        print(f"DEBUG Final capacities: Mcy={moment_capacity_y}kN·m, Mcz={moment_capacity_z}kN·m")


        # Utilization ratios
        ur_moment_y = self.moment_y / moment_capacity_y if moment_capacity_y else 0
        ur_moment_z = self.moment_z / moment_capacity_z if moment_capacity_z else 0
        
        self.results['moment_capacity_y'] = round(moment_capacity_y, 1)
        self.results['moment_capacity_z'] = round(moment_capacity_z, 1)
        self.results['ur_moment_y'] = round(ur_moment_y, 2)
        self.results['ur_moment_z'] = round(ur_moment_z, 2)
        self.results['moment_y_ok'] = bool(ur_moment_y <= 1.0)
        self.results['moment_z_ok'] = bool(ur_moment_z <= 1.0)
        
        return ur_moment_y, ur_moment_z
    
    def check_tension_capacity(self):
        """Check tension capacity"""
        pt = self.py * self.A / 1000  # kN
        ur_tension = self.axial_force / pt if pt else 0  # axial_force already in kN
        
        self.results['tension_capacity'] = round(pt, 1)
        self.results['ur_tension'] = round(ur_tension, 2)
        self.results['tension_ok'] = bool(ur_tension <= 1.0)
        
        return ur_tension
    
    def check_compression_buckling(self):
        """Check compression buckling capacity"""
        Leff = self.L * self.Cb * 1000  # Convert m to mm
        lamb = Leff / self.ry if self.ry else 0  # Slenderness ratio (dimensionless)
        
        # Buckling curve parameters
        max_thickness = max(self.t, self.T)
        
        if self.beam_type == "UC":
            if max_thickness <= 40:
                alpha = 3.5  # curve b
            else:
                alpha = 5.5  # curve c
        elif self.beam_type == "UB":
            if max_thickness <= 40:
                alpha = 2.0  # curve a
            else:
                alpha = 3.5  # curve b
        elif self.beam_type in ["PFC", "EA"]:
            alpha = 5.5  # curve c
        elif self.beam_type in ["RHS", "SHS", "CHS"]:
            alpha = 1.8  # curve a0
        else:
            alpha = 5.5
        
        # Compressive buckling strength
        pE_c = pi ** 2 * self.E / (lamb ** 2) if lamb > 0 else float('inf')
        lamb_o = 0.2 * sqrt(pi ** 2 * self.E / self.py)
        eth = alpha * (lamb - lamb_o) / 1000
        
        phi_c = (self.py + (eth + 1) * pE_c) / 2
        pcb = (pE_c * self.py) / (phi_c + sqrt(phi_c ** 2 - pE_c * self.py)) if pE_c * self.py > 0 else 0
        
        Pcb = pcb * self.A / 1000  # kN
        ur_compression = self.axial_force / Pcb if Pcb else 0  # axial_force already in kN
        
        self.results['compression_capacity'] = round(Pcb, 1)
        self.results['ur_compression'] = round(ur_compression, 2)
        self.results['compression_ok'] = bool(ur_compression <= 1.0)
        
        return ur_compression
    
    def check_lateral_torsional_buckling(self):
        """Check lateral torsional buckling"""
        # Determine if LTB check is required
        ep = self._get_ep()
        Leff = self.L * 1.2 * 1000  # Convert m to mm
        lamb = Leff / self.ry if self.ry else 0  # Slenderness ratio (dimensionless)
        
        tb_required = False
        
        if self.beam_type in ["Hbeam", "Ibeam", "PFC", "EA", "UA"]:
            p_values = {275: 34.3, 265: 35.0, 255: 35.6, 245: 36.3, 235: 37.1,
                        355: 30.2, 345: 30.6, 335: 31.1, 325: 31.6, 315: 32.1,
                        460: 26.5, 440: 27.1, 430: 27.4, 410: 28.1, 400: 28.4,
                        215: 38.8, 310: 32.3, 350: 30.4, 380: 29.2}
            limit = p_values.get(int(round(self.py)), float('inf'))
            tb_required = lamb >= limit
        
        elif self.beam_type == "RHS":
            ratio_DB = self.D / self.B if self.B else 0
            limits = [(1.25, 770), (1.33, 670), (1.4, 580), (1.5, 550),
                      (1.67, 515), (1.75, 410), (1.8, 395), (2.0, 340),
                      (2.5, 275), (3.0, 225), (4.0, 170)]
            
            for limit_ratio, value in limits:
                if ratio_DB <= limit_ratio:
                    tb_required = lamb >= value * ep ** 2
                    break
        
        if not tb_required:
            self.results['ltb_required'] = False
            self.results['ur_ltb'] = 0
            self.results['ltb_ok'] = True
            self.results['ltb_capacity'] = 0  # Not applicable when LTB check not required
            return 0
        
        self.results['ltb_required'] = True
        
        # Calculate LTB parameters
        section_class = self.results.get('section_class', 3)
        reduction_factor = self.results.get('reduction_factor', 1.0)
        
        if self.beam_type in ["Hbeam", "Ibeam"]:
            hs = self.D - self.T
            gam = 1 - (self.Iy / self.Iz) if self.Iz else 0
            u = (4 * self.Sz ** 2 * gam / (self.A ** 2 * hs ** 2)) ** 0.25 if self.A and hs else 0.9
            x = 0.566 * hs * sqrt(self.A / self.J) if self.J else 0
        
        elif self.beam_type == "PFC":
            hs = self.D - self.T
            gam = 1 - (self.Iy / self.Iz) if self.Iz else 0
            u = (4 * self.Sz ** 2 * gam / (self.A ** 2 * hs ** 2)) ** 0.25 if self.A and hs else 0.9
            x = 1.132 * sqrt(self.A * self.J / (self.Iz * self.J)) if self.Iz and self.J else 0
        
        elif self.beam_type in ["EA", "RHS"]:
            u = 0.9
            x = self.D / self.T if self.T else 0
        
        else:
            u = 0.9
            x = 0
        
        v = 1 / (1 + 0.05 * (lamb / x) ** 2) ** 0.25 if x > 0 else 1
        
        # Beta factor based on section class
        if section_class in [1, 2]:
            betaw = 1
        elif section_class == 3:
            betaw = self.Zz / self.Sz if self.Sz else 1
        else:
            betaw = reduction_factor ** 2 * self.Zz / self.Sz if self.Sz else 1
        
        lamb_lt = u * v * lamb * sqrt(betaw)
        pE_lt = pi ** 2 * self.E / (lamb_lt ** 2) if lamb_lt > 0 else 0
        lamb_lo = 0.4 * sqrt(pi ** 2 * self.E / self.py)
        eth_lt = 0.007 * (lamb_lt - lamb_lo)
        phi_lt = (self.py + (eth_lt + 1) * pE_lt) / 2
        pb = (pE_lt * self.py) / (phi_lt + sqrt(phi_lt ** 2 - pE_lt * self.py)) if pE_lt * self.py > 0 else 0
        
        # Lateral torsional buckling strength (kN·m)
        if section_class in [1, 2]:
            Pb = pb * self.Sz / 1e6  # MPa * mm³ / 1e6 = kN·m
        elif section_class == 3:
            Pb = pb * self.Zz / 1e6
        else:
            Pb = reduction_factor * pb * self.Zz / 1e6
        
        ur_ltb = self.moment_z / Pb if Pb else 0  # moment_z already in kN·m
        
        print(f"DEBUG LTB calc: lamb={lamb:.2f}, limit={limit}, section_class={section_class}, reduction_factor={reduction_factor:.2f}, u={u:.2f}, x={x:.2f}, v={v:.2f}, betaw={betaw:.2f}, lamb_lt={lamb_lt:.2f}, pE_lt={pE_lt:.2f}MPa, phi_lt={phi_lt:.2f}MPa, pb={pb:.2f}MPa, Pb={Pb:.2f}kN·m, ur_ltb={ur_ltb:.4f}")
        self.results['ltb_capacity'] = round(Pb, 2)
        self.results['ur_ltb'] = round(ur_ltb, 4)
        self.results['ltb_ok'] = bool(ur_ltb <= 1.0)
        
        return ur_ltb
    
    def check_combined_effects(self):
        """Check combined tension/compression with bending"""
        ur_tension = self.results.get('ur_tension', 0)
        ur_compression = self.results.get('ur_compression', 0)
        ur_moment_y = self.results.get('ur_moment_y', 0)
        ur_moment_z = self.results.get('ur_moment_z', 0)
        ur_ltb = self.results.get('ur_ltb', 0)
        
        # Combined tension + biaxial moment
        combined_tension_moment = ur_tension + ur_moment_y + ur_moment_z
        
        # Combined tension + buckling
        combined_tension_buckling = ur_tension + ur_ltb + ur_moment_y
        
        # Combined compression + biaxial moment
        combined_compression_moment = ur_compression + ur_moment_y + ur_moment_z
        
        # Combined compression + buckling
        combined_compression_buckling = ur_compression + ur_ltb + ur_moment_y
        
        self.results['combined_tension_moment'] = round(combined_tension_moment, 4)
        self.results['combined_tension_buckling'] = round(combined_tension_buckling, 4)
        self.results['combined_compression_moment'] = round(combined_compression_moment, 4)
        self.results['combined_compression_buckling'] = round(combined_compression_buckling, 4)
        self.results['combined_tension_moment_ok'] = bool(combined_tension_moment <= 1.0)
        self.results['combined_tension_buckling_ok'] = bool(combined_tension_buckling <= 1.0)
        self.results['combined_compression_moment_ok'] = bool(combined_compression_moment <= 1.0)
        self.results['combined_compression_buckling_ok'] = bool(combined_compression_buckling <= 1.0)
        
        return {
            'tension_moment': combined_tension_moment,
            'tension_buckling': combined_tension_buckling,
            'compression_moment': combined_compression_moment,
            'compression_buckling': combined_compression_buckling
        }
    
    def check_deflection(self):
        """Check deflection limits based on SLS requirements"""
        # Get max deflection from member forces
        max_deflection = self.member_forces.get('max_deflection', 0)  # in mm

        # Requested deflection limits:
        # - General + no cantilever part: L/200
        # - Crane   + no cantilever part: L/600
        # - General + any cantilever part: L/180
        # - Crane   + any cantilever part: L/250
        L_mm = self.L * 1000  # Convert m to mm

        purpose_text = str(self.beam_purpose).strip().lower()
        is_crane = (purpose_text == "crane") or ("for crane" in purpose_text) or ("crane" in purpose_text)

        has_cantilever = bool(self.has_cantilever_part or self.support_condition == "cantilever")
        if has_cantilever:
            denominator = 250 if is_crane else 180
        else:
            denominator = 600 if is_crane else 200

        deflection_limit = L_mm / denominator if denominator > 0 else 0
        
        # Calculate utilization
        vertical_deflection_util = abs(max_deflection) / deflection_limit if deflection_limit > 0 else 0
        
        self.results['vertical_deflection'] = round(max_deflection, 3)
        self.results['deflection_limit'] = round(deflection_limit, 3)
        self.results['vertical_deflection_util'] = round(vertical_deflection_util, 4)
        self.results['deflection_ok'] = bool(vertical_deflection_util <= 1.0)
        self.results['deflection_limit_rule'] = f"L/{denominator}"
        
        return vertical_deflection_util
    
    def run_all_checks(self):
        """Run all structural checks and return results"""
        # Section classification
        self.classify_section()
        
        # Deflection check (SLS)
        self.check_deflection()
        
        # Shear capacity
        ur_shear_y, ur_shear_z = self.check_shear_capacity()
        
        # Moment capacity
        self.check_moment_capacity(ur_shear_y, ur_shear_z)
        
        # Tension capacity
        self.check_tension_capacity()
        
        # Compression buckling
        self.check_compression_buckling()
        
        # Lateral torsional buckling
        self.check_lateral_torsional_buckling()
        
        # Combined effects
        combined = self.check_combined_effects()
        
        # Calculate max utilization
        ur_values = [
            self.results.get('vertical_deflection_util', 0),
            self.results.get('ur_shear_y', 0),
            self.results.get('ur_shear_z', 0),
            self.results.get('ur_moment_y', 0),
            self.results.get('ur_moment_z', 0),
            self.results.get('ur_tension', 0),
            self.results.get('ur_compression', 0),
            self.results.get('ur_ltb', 0),
            combined.get('tension_moment', 0),
            combined.get('tension_buckling', 0),
            combined.get('compression_moment', 0),
            combined.get('compression_buckling', 0)
        ]
        max_ur = max(ur_values)
        
        self.results['max_utilization'] = round(max_ur, 4)
        self.results['overall_ok'] = bool(max_ur <= 1.0)
        
        # Convert all values to JSON-serializable types
        return self._make_json_serializable(self.results)
    
    def _make_json_serializable(self, obj):
        """Convert numpy types to native Python types for JSON serialization"""
        if isinstance(obj, dict):
            return {k: self._make_json_serializable(v) for k, v in obj.items()}
        elif isinstance(obj, (list, tuple)):
            return [self._make_json_serializable(item) for item in obj]
        elif isinstance(obj, np.bool_):
            return bool(obj)
        elif isinstance(obj, (np.integer, np.int64, np.int32)):
            return int(obj)
        elif isinstance(obj, (np.floating, np.float64, np.float32)):
            return float(obj)
        else:
            return obj


@app.route('/')
def index():
    return render_template('index.html')

@app.route('/calculate', methods=['POST'])
def calculate():
    try:
        data = request.json
        
        # Extract beam parameters (convert from meters to mm for internal calculations)
        beam_length = float(data.get('beam_length', 1000)) * 1000  # Convert meters to mm
        beam_type = data.get('beam_type', 'Square Bar') # I,H beam, Channel, RHS, SHS, CHS, Angle
        material = data.get('material', 'Steel')
        beam_purpose = data.get('beam_purpose', 'general')
        section_props = data.get('section_props', {})
        design_strength = int(data.get('design_strength', 275))

        # Extract supports (convert positions from meters to mm)
        supports_raw = data.get('supports', [])
        if not supports_raw:
            # Default to simply supported beam
            supports = [
                {'position': 0, 'type': 'pinned'},
                {'position': beam_length, 'type': 'roller'}
            ]
        else:
            # Convert support positions from meters to mm
            supports = [{'position': s['position'] * 1000, 'type': s['type']} for s in supports_raw]
        
        # Extract loads and convert units (positions from m to mm, forces from kN to N)
        loads_raw = data.get('loads', [])
        loads = []
        for load in loads_raw:
            load_converted = load.copy()
            # Convert position from meters to mm
            load_converted['position'] = float(load['position']) * 1000
            # Convert force/moment magnitudes
            if load.get('type') == 'point load':
                load_converted['magnitude'] = float(load['magnitude']) * 1000  # kN to N
            elif load.get('type') == 'uniform distributed load':
                load_converted['magnitude'] = float(load['magnitude']) * 1000 / 1000  # kN/m to N/mm
                # Also convert length if specified
                if 'length' in load:
                    load_converted['length'] = float(load.get('length', 0)) * 1000  # m to mm
            else:  # moment
                load_converted['magnitude'] = float(load['magnitude']) * 1000000  # kN·m to N·mm
            loads.append(load_converted)
        
        # Extract section properties
        section_props = data.get('section_props', {})
        section_props['length'] = beam_length  # Already in mm
        
        # Determine support condition based on supports
        if len(supports) == 1 and supports[0]['type'] == 'fixed':
            support_condition = "cantilever"
        elif len(supports) >= 2:
            # Check if both ends are fixed
            if all(s['type'] == 'fixed' for s in supports):
                support_condition = "fixed"
            else:
                support_condition = "simply supported"
        else:
            support_condition = "simply supported"

        # Determine whether any cantilever/overhang part exists.
        # If supports do not cover both beam ends, there is an overhang part.
        has_cantilever_part = False
        if supports:
            support_positions = sorted(float(s['position']) for s in supports)
            tol_mm = 1.0
            left_overhang = support_positions[0] > tol_mm
            right_overhang = support_positions[-1] < (beam_length - tol_mm)
            has_cantilever_part = left_overhang or right_overhang or (len(supports) == 1)
        
        # Create calculator and solve
        calculator = SteelBeamCalculator(beam_length, supports, loads, beam_type, material, section_props)
        results = calculator.solve_beam()
        
        # Calculate summaries
        reactions = calculator.calculate_reactions_summary(results)
        member_forces = calculator.calculate_member_forces(results)
        
        # Run member checks if section properties are available
        member_check_results = {}
        # Check if section properties are complete enough for valid member check
        has_valid_props = (
            section_props and 
            section_props.get('area', 0) > 0 and
            (section_props.get('D', 0) > 0 or section_props.get('h', 0) > 0) and
            (section_props.get('Sz', 0) > 0 or section_props.get('zpx', 0) > 0 or section_props.get('Zpx', 0) > 0)
        )
        
        if has_valid_props:
            # Map frontend beam types to checker beam types
            beam_type_mapping = {
                'IHbeam': 'Ibeam',
                'Hbeam': 'Hbeam',
                'Ibeam': 'Ibeam',
                'Channel': 'PFC',
                'RHS': 'RHS',
                'SHS': 'SHS',
                'CHS': 'CHS',
                'EA': 'EA',
                'UA': 'UA'
            }
            checker_beam_type = beam_type_mapping.get(beam_type, 'Ibeam')
            
            # Normalize section properties to handle both frontend and database naming conventions
            normalized_props = {
                'area': section_props.get('area', 0),
                'h': section_props.get('D', section_props.get('h', 0)),
                'b': section_props.get('B', section_props.get('b', 0)),
                'tf': section_props.get('T', section_props.get('tf', 0)),
                'tw': section_props.get('t', section_props.get('tw', 0)),
                't': section_props.get('t', 0),  # for hollow sections
                'd': section_props.get('D', section_props.get('d', 0)),  # for CHS
                'r': section_props.get('ro', section_props.get('r', 0)),
                'ix': section_props.get('Ix', section_props.get('ix', 0)),
                'iy': section_props.get('Iy', section_props.get('iy', 0)),
                'rx': section_props.get('rx', 0),
                'ry': section_props.get('ry', 0),
                'zpx': section_props.get('Zpx', section_props.get('Sz', section_props.get('zpx', 0))),
                'zpy': section_props.get('Zpy', section_props.get('Sy', section_props.get('zpy', 0))),
                'zex': section_props.get('Zex', section_props.get('zex', 0)),
                'zey': section_props.get('Zey', section_props.get('zey', 0)),
                'j': section_props.get('j', 0),
                'weight': section_props.get('weight', 0),
                'length': section_props.get('length', beam_length)
            }
            
            # Prepare material properties
            material_props = {
                'E': 205000,
                'py': design_strength
            }
            
            # Create checker instance
            checker = SteelBeamChecker(
                section_props=normalized_props,
                beam_type=checker_beam_type,
                support_condition=support_condition,
                beam_purpose=beam_purpose,
                material_props=material_props,
                member_forces=member_forces,
                beam_length=beam_length / 1000,  # Convert mm to meters for checker
                has_cantilever_part=has_cantilever_part
            )
            
            # Run all checks
            member_check_results = checker.run_all_checks()
            print(f"DEBUG - Member check completed:")
            print(f"  Section class: {member_check_results.get('section_class')}")
            print(f"  Deflection: {member_check_results.get('vertical_deflection')}mm / {member_check_results.get('deflection_limit')}mm = {member_check_results.get('vertical_deflection_util')}")
            print(f"  Shear Y: {member_check_results.get('ur_shear_y')} ({member_forces.get('shear_major')}kN / {member_check_results.get('shear_capacity_y')}kN)")
            print(f"  Moment Z: {member_check_results.get('ur_moment_z')} ({member_forces.get('bending_major')}kN·m / {member_check_results.get('moment_capacity_z')}kN·m)")
            print(f"  Tension: {member_check_results.get('ur_tension')} ({member_forces.get('axial_force')}kN / {member_check_results.get('tension_capacity')}kN)")
            print(f"  Compression: {member_check_results.get('ur_compression')} (capacity: {member_check_results.get('compression_capacity')}kN)")
            print(f"  LTB: {member_check_results.get('ur_ltb')} (capacity: {member_check_results.get('ltb_capacity')}kN·m)")
        else:
            print(f"DEBUG - Skipping member check: incomplete section properties (area={section_props.get('area', 0) if section_props else 0}, D/h={section_props.get('D', 0) if section_props else 0}, Sz/zpx={section_props.get('Sz', 0) if section_props else 0})")
        
        # Convert diagram data for frontend (x in meters, y in appropriate units)
        results_v = results.get('vertical', {})
        results_t = results.get('transverse', {})
        
        # Vertical direction diagrams
        shear_diagram_v_kN = [v / 1000 for v in results_v.get('shear_forces', [])]  # N to kN
        moment_diagram_v_kNm = [m / 1e6 for m in results_v.get('bending_moments', [])]  # N·mm to kN·m
        x_coords_v_m = [x / 1000 for x in results_v.get('x_coords', [])]  # mm to m
        x_deflection_v_m = [x / 1000 for x in results_v.get('x_deflection', [])]  # mm to m
        deflections_v = results_v.get('deflections', [])
        
        # Transverse direction diagrams
        shear_diagram_t_kN = [v / 1000 for v in results_t.get('shear_forces', [])]  # N to kN
        moment_diagram_t_kNm = [m / 1e6 for m in results_t.get('bending_moments', [])]  # N·mm to kN·m
        x_coords_t_m = [x / 1000 for x in results_t.get('x_coords', [])]  # mm to m
        x_deflection_t_m = [x / 1000 for x in results_t.get('x_deflection', [])]  # mm to m
        deflections_t = results_t.get('deflections', [])
        
        # Prepare response
        return jsonify({
            'success': True,
            'member_forces': member_forces,
            'reactions': reactions,
            # Vertical direction (major axis)
            'shear_diagram': {
                'x': x_coords_v_m,
                'y': shear_diagram_v_kN
            },
            'moment_diagram': {
                'x': x_coords_v_m,
                'y': moment_diagram_v_kNm
            },
            'deflection_diagram': {
                'x': x_deflection_v_m,
                'y': deflections_v
            },
            # Transverse direction (minor axis)
            'shear_diagram_transverse': {
                'x': x_coords_t_m,
                'y': shear_diagram_t_kN
            },
            'moment_diagram_transverse': {
                'x': x_coords_t_m,
                'y': moment_diagram_t_kNm
            },
            'deflection_diagram_transverse': {
                'x': x_deflection_t_m,
                'y': deflections_t
            },
            'max_deflection': member_forces['max_deflection'],
            'max_deflection_transverse': member_forces.get('max_deflection_transverse', 0),
            'member_check': member_check_results
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})

if __name__ == '__main__':
    app.run(debug=True)